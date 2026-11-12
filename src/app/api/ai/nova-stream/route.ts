import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  resolveSessionContext,
} from "@/lib/api/session-http";
import { streamStudioAssistantWithNova } from "@/lib/bedrock/client";
import { formatUsdDisplay } from "@/lib/domain/money";

export const runtime = "nodejs";

function summarizeSessionForStudio(
  data: Awaited<ReturnType<typeof resolveSessionContext>>["data"]
): string {
  const pricedCents = data.inspections
    .flatMap((i) => i.items)
    .reduce((sum, item) => sum + (item.channel3PriceCents ?? 0), 0);
  const capturedCents = data.inspections
    .flatMap((i) => i.items)
    .reduce((sum, item) => sum + (item.capturedAmountCents ?? 0), 0);
  const netRevenueCents = data.transactions.reduce(
    (sum, txn) => sum + txn.signedAmountCents,
    0
  );
  const totalDisputes = data.disputes.length;
  const wonDisputes = data.disputes.filter((d) => d.status === "Won").length;

  const recoveryPct =
    pricedCents > 0 ? ((capturedCents / pricedCents) * 100).toFixed(1) : "0.0";
  const winPct =
    totalDisputes > 0 ? ((wonDisputes / totalDisputes) * 100).toFixed(1) : "0.0";

  return JSON.stringify({
    bookingsCount: data.bookings.length,
    assetsCount: data.assets.length,
    transactionsCount: data.transactions.length,
    disputesCount: totalDisputes,
    wonDisputes,
    depositRecoveryRatePct: recoveryPct,
    disputeWinRatePct: winPct,
    netFleetRevenueUsd: formatUsdDisplay(netRevenueCents),
    disputes: data.disputes.map((d) => ({
      id: d.id,
      bookingId: d.bookingId,
      status: d.status,
      hasEvidencePacket: Boolean(d.evidencePacketSummary),
      hasChannel3ProofUrl: Boolean(d.channel3ProofUrl),
    })),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await resolveSessionContext(req);
  const rateBlocked = await enforceRateLimit(req, ctx.sessionId);
  if (rateBlocked) return rateBlocked;

  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    history?: Array<{ role: "user" | "assistant"; text: string }>;
  };

  if (!body.prompt?.trim()) {
    return jsonError("Missing prompt.", 400);
  }

  const snapshot = summarizeSessionForStudio(ctx.data);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, payload: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
        );
      };

      try {
        // FR-073: Emit deterministic readiness check snapshot as tool telemetry
        if (
          body.prompt!.toLowerCase().includes("dispute") ||
          body.prompt!.toLowerCase().includes("readiness")
        ) {
          sendEvent("tool_result", {
            tool: "check_dispute_evidence_readiness",
            snapshot: JSON.parse(snapshot),
          });
        }

        for await (const chunk of streamStudioAssistantWithNova({
          prompt: `<untrusted_record>\n${body.prompt!.trim()}\n</untrusted_record>`,
          history: body.history,
          sessionContext: snapshot,
        })) {
          if (chunk.type === "meta") {
            sendEvent("meta", { modelUsed: chunk.modelUsed });
          } else {
            sendEvent("text_delta", { delta: chunk.delta });
          }
        }

        sendEvent("done", { ok: true });
      } catch (err) {
        sendEvent("error", {
          message: err instanceof Error ? err.message : "Nova stream failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

