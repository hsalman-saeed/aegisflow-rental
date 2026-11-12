import type {
  AgAiEvent,
  AgAiTool,
  AgLlmAdapter,
  AgLlmExecuteTurnOptions,
  AgLlmRequest,
  AgLlmResponse,
  AgLlmResponseHandler,
} from "ag-studio";
import type { SessionData } from "@/types/domain";

export interface EvidencePillarStatus {
  key:
    | "depositHoldVerified"
    | "inspectorSignOffVerified"
    | "channel3PriceProofLocked"
    | "partialSettlementRecorded";
  label: string;
  passed: boolean;
  detail: string;
}

export interface DisputeReadinessReport {
  bookingId: string;
  disputeId: string | null;
  readyForRepresentment: boolean;
  passedCount: number;
  totalPillars: number;
  score: string;
  pillars: EvidencePillarStatus[];
  summary: string;
}

/**
 * FR-073 / AC-073-1: Pure read-only readiness tool that audits the 4 representment
 * evidence pillars without mutating session state or calling Braintree write APIs.
 */
export function checkDisputeEvidenceReadiness(
  session: SessionData,
  bookingIdOrDisputeId?: string
): DisputeReadinessReport {
  const matchedDispute = bookingIdOrDisputeId
    ? session.disputes.find(
        (d) =>
          d.id === bookingIdOrDisputeId ||
          d.braintreeDisputeId === bookingIdOrDisputeId ||
          d.bookingId === bookingIdOrDisputeId
      )
    : session.disputes[0];

  const targetBookingId =
    matchedDispute?.bookingId ??
    (bookingIdOrDisputeId &&
    session.bookings.some((b) => b.id === bookingIdOrDisputeId)
      ? bookingIdOrDisputeId
      : session.bookings[0]?.id ?? "BK-9021");

  const booking = session.bookings.find((b) => b.id === targetBookingId);
  const inspection = session.inspections.find(
    (i) => i.bookingId === targetBookingId
  );
  const discrepancyItems = (inspection?.items ?? []).filter(
    (it) => it.type === "missing" || it.type === "damaged"
  );
  const settledChildTxns = session.transactions.filter(
    (t) =>
      t.bookingId === targetBookingId &&
      t.type === "partial_settlement" &&
      t.status === "settled"
  );

  const pillar1Passed = Boolean(
    booking &&
      booking.authStatus === "authorized" &&
      booking.parentTransactionId
  );
  const pillar2Passed = Boolean(
    inspection && inspection.inspectorVerified && inspection.signOffTimestamp
  );
  const pillar3Passed =
    discrepancyItems.length > 0 &&
    discrepancyItems.every(
      (it) =>
        typeof it.channel3PriceCents === "number" &&
        it.channel3PriceCents > 0 &&
        Boolean(it.channel3RetailUrl)
    );
  const pillar4Passed = settledChildTxns.length > 0;

  const pillars: EvidencePillarStatus[] = [
    {
      key: "depositHoldVerified",
      label: "1. Deposit Hold Authorized",
      passed: pillar1Passed,
      detail: pillar1Passed
        ? `Parent auth hold verified (${booking?.parentTransactionId}).`
        : `Booking ${targetBookingId} lacks an authorized parent hold.`,
    },
    {
      key: "inspectorSignOffVerified",
      label: "2. Yard Inspector Sign-Off",
      passed: pillar2Passed,
      detail: pillar2Passed
        ? `Signed off at ${inspection?.signOffTimestamp}.`
        : "Yard inspector sign-off timestamp is missing.",
    },
    {
      key: "channel3PriceProofLocked",
      label: "3. Channel3 Retail Price Proof Locked",
      passed: pillar3Passed,
      detail: pillar3Passed
        ? `${discrepancyItems.length} discrepancy item(s) locked with live retail URLs.`
        : "One or more discrepancy items lack locked Channel3 price proof.",
    },
    {
      key: "partialSettlementRecorded",
      label: "4. Settled Child Capture Recorded",
      passed: pillar4Passed,
      detail: pillar4Passed
        ? `${settledChildTxns.length} settled child transaction(s) (${settledChildTxns.map((t) => t.braintreeId).join(", ")}).`
        : "No settled partial-capture child transaction recorded yet.",
    },
  ];

  const passedCount = pillars.filter((p) => p.passed).length;
  const totalPillars = pillars.length;
  const readyForRepresentment = passedCount === totalPillars;

  return {
    bookingId: targetBookingId,
    disputeId: matchedDispute?.braintreeDisputeId ?? matchedDispute?.id ?? null,
    readyForRepresentment,
    passedCount,
    totalPillars,
    score: `${passedCount}/${totalPillars}`,
    pillars,
    summary: readyForRepresentment
      ? `Booking ${targetBookingId} passed all 4/4 representment readiness pillars and is ready for Braintree submission.`
      : `Booking ${targetBookingId} passed ${passedCount}/4 pillars. Complete remaining steps before representment submission.`,
  };
}

/**
 * Exposes `check_dispute_evidence_readiness` as an AG Studio `AgAiTool` (`kind: "client"`).
 */
export function createReadinessAiTool(
  getSession: () => SessionData
): AgAiTool {
  return {
    name: "check_dispute_evidence_readiness",
    description:
      "Read-only audit of the 4 chargeback representment pillars (deposit hold, inspector sign-off, Channel3 retail URL proof, settled child capture) for a booking or dispute.",
    kind: "client",
    schema: () => ({
      name: "check_dispute_evidence_readiness",
      description:
        "Audit whether a booking or dispute has all 4 grounded evidence pillars ready for Braintree representment.",
      kind: "client",
      parameters: {
        type: "object",
        properties: {
          bookingIdOrDisputeId: {
            type: "string",
            description: "Optional booking ID (e.g. BK-9021) or dispute ID.",
          },
        },
      },
    }),
    async execute(call, ctx) {
      const arg =
        typeof call.args.bookingIdOrDisputeId === "string"
          ? call.args.bookingIdOrDisputeId
          : undefined;
      const report = checkDisputeEvidenceReadiness(getSession(), arg);
      return ctx.success(report.summary, report);
    },
  };
}

export interface NovaStreamCallbacks {
  onMeta?: (modelUsed: string) => void;
  onToolResult?: (tool: string, snapshot: unknown) => void;
  onDelta?: (delta: string) => void;
}

/**
 * Consumes `/api/ai/nova-stream` SSE events and handles HTTP 429 rate limits cleanly (`AC-072-2`).
 */
export async function streamNovaAssistantTurn(params: {
  prompt: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  signal?: AbortSignal;
  callbacks?: NovaStreamCallbacks;
}): Promise<{ fullText: string; modelUsed: string; rateLimited: boolean }> {
  const res = await fetch("/api/ai/nova-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: params.prompt,
      history: params.history,
    }),
    signal: params.signal,
  });

  if (res.status === 429) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    const message =
      errBody.error ??
      "Rate limit reached (HTTP 429) for Amazon Nova Studio Assistant. Please wait a moment and retry.";
    params.callbacks?.onDelta?.(message);
    return {
      fullText: message,
      modelUsed: "rate-limited",
      rateLimited: true,
    };
  }

  if (!res.ok || !res.body) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      errBody.error ?? `Nova stream request failed with HTTP ${res.status}.`
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let modelUsed = "amazon-nova-lite";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const lines = frame.split("\n");
      let eventType = "message";
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLine += line.slice(5).trim();
        }
      }
      if (!dataLine) continue;

      try {
        const parsed = JSON.parse(dataLine) as Record<string, unknown>;
        if (eventType === "meta" && typeof parsed.modelUsed === "string") {
          modelUsed = parsed.modelUsed;
          params.callbacks?.onMeta?.(modelUsed);
        } else if (eventType === "tool_result") {
          params.callbacks?.onToolResult?.(
            String(parsed.tool ?? "check_dispute_evidence_readiness"),
            parsed.snapshot
          );
        } else if (
          eventType === "text_delta" &&
          typeof parsed.delta === "string"
        ) {
          fullText += parsed.delta;
          params.callbacks?.onDelta?.(parsed.delta);
        } else if (eventType === "error" && typeof parsed.message === "string") {
          throw new Error(parsed.message);
        }
      } catch (err) {
        if (eventType === "error") throw err;
      }
    }
  }

  return { fullText, modelUsed, rateLimited: false };
}

function extractPromptFromRequest(request: AgLlmRequest): {
  prompt: string;
  history: Array<{ role: "user" | "assistant"; text: string }>;
} {
  const history: Array<{ role: "user" | "assistant"; text: string }> = [];
  for (const item of request.input) {
    if (item.kind === "input" && item.type === "message") {
      const text = item.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      if (text.trim()) {
        history.push({
          role: item.role === "system" ? "user" : "user",
          text,
        });
      }
    } else if (item.kind === "output" && item.type === "message") {
      const text = item.content
        .map((c) => (c.type === "text" ? c.text : c.refusal))
        .join("\n");
      if (text.trim()) {
        history.push({ role: "assistant", text });
      }
    }
  }

  const lastUser = [...history].reverse().find((h) => h.role === "user");
  const prompt = lastUser?.text ?? "Summarize fleet deposit health and readiness.";
  return { prompt, history: history.slice(0, -1) };
}

/**
 * Custom AG Studio 3.1 `AgLlmAdapter` streaming turns from `/api/ai/nova-stream` (`FR-072`).
 */
export function createBedrockNovaAgAdapter(): AgLlmAdapter {
  return {
    executeTurn(
      request: AgLlmRequest,
      options?: AgLlmExecuteTurnOptions
    ): AgLlmResponseHandler {
      const messageId = `msg_${Date.now()}`;
      const responseId = `resp_${Date.now()}`;
      const { prompt, history } = extractPromptFromRequest(request);

      let resolveComplete!: (resp: AgLlmResponse) => void;
      const complete = new Promise<AgLlmResponse>((res) => {
        resolveComplete = res;
      });

      const stream: AsyncIterable<AgAiEvent> = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: "TEXT_MESSAGE_START",
            messageId,
            role: "assistant",
          };

          let fullText = "";
          let modelUsed = "amazon-nova-lite";

          try {
            const chunks: string[] = [];
            const result = await streamNovaAssistantTurn({
              prompt,
              history,
              signal: options?.signal,
              callbacks: {
                onMeta: (m) => {
                  modelUsed = m;
                },
                onDelta: (d) => {
                  chunks.push(d);
                },
              },
            });
            fullText = result.fullText;
            modelUsed = result.modelUsed;
            for (const delta of chunks) {
              yield {
                type: "TEXT_MESSAGE_CONTENT",
                messageId,
                delta,
              };
            }
            yield {
              type: "TEXT_MESSAGE_END",
              messageId,
            };

            resolveComplete({
              id: responseId,
              createdAt: Date.now(),
              status: "completed",
              model: modelUsed,
              output: [
                {
                  id: messageId,
                  kind: "output",
                  type: "message",
                  role: "assistant",
                  status: "completed",
                  content: [
                    {
                      type: "text",
                      text: fullText,
                      annotations: [],
                    },
                  ],
                },
              ],
            });
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : "Nova adapter error.";
            yield {
              type: "TEXT_MESSAGE_CONTENT",
              messageId,
              delta: msg,
            };
            yield {
              type: "TEXT_MESSAGE_END",
              messageId,
            };
            resolveComplete({
              id: responseId,
              createdAt: Date.now(),
              status: "failed",
              error: { code: "NOVA_ADAPTER_ERROR", message: msg },
              output: [],
            });
          }
        },
      };

      return { stream, complete };
    },
  };
}

