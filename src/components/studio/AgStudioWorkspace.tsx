"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  checkDisputeEvidenceReadiness,
  streamNovaAssistantTurn,
  type DisputeReadinessReport,
} from "@/lib/ag-studio/bedrock-nova-adapter";
import { buildStudioTabularSnapshot } from "@/lib/ag-studio/data-sources";
import { DepositHealthWidget } from "@/components/studio/DepositHealthWidget";
import { BraintreeInspectorModal } from "@/components/workflow/BraintreeIdPill";
import { formatUsdCents } from "@/lib/ui/api-client";
import type { SessionData } from "@/types/domain";

const COLUMN_LABELS: Record<string, string> = {
  id: "ID",
  braintreeId: "Braintree ID",
  braintreeDisputeId: "Braintree Dispute ID",
  bookingId: "Booking ID",
  customerId: "Customer",
  assetId: "Asset",
  type: "Type",
  captureMode: "Capture Mode",
  paymentMethod: "Payment Rail",
  amountUsd: "Amount (USD)",
  signedAmountUsd: "Net Impact (USD)",
  depositHoldUsd: "Deposit Hold (USD)",
  rentalFeeUsd: "Rental Fee (USD)",
  dailyRateUsd: "Daily Rate (USD)",
  replacementValueUsd: "Replacement Value (USD)",
  channel3PriceUsd: "Channel3 Price (USD)",
  capturedAmountUsd: "Captured (USD)",
  amountDisputedUsd: "Disputed (USD)",
  status: "Status",
  authStatus: "Auth Status",
  scheduleStatus: "Schedule Status",
  createdAt: "Timestamp",
  startDate: "Start Date",
  endDate: "End Date",
};

const USD_COLUMNS = new Set([
  "amountUsd",
  "signedAmountUsd",
  "depositHoldUsd",
  "rentalFeeUsd",
  "dailyRateUsd",
  "replacementValueUsd",
  "channel3PriceUsd",
  "capturedAmountUsd",
  "amountDisputedUsd",
]);

function formatColumnHeader(col: string): string {
  if (COLUMN_LABELS[col]) return COLUMN_LABELS[col]!;
  return col
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

const AgStudioInner = dynamic(() => import("./AgStudioInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[640px] items-center justify-center rounded-xl border border-gray-800 bg-[#090D16] text-xs text-gray-400">
      Initializing AG Studio 3.1 Relational Analytics Canvas...
    </div>
  ),
});

type TableKey =
  | "customers"
  | "assets"
  | "bookings"
  | "transactions"
  | "inspections"
  | "disputes";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  modelUsed?: string;
  toolVerified?: boolean;
  readinessReport?: DisputeReadinessReport;
  rateLimited?: boolean;
}

interface AgStudioWorkspaceProps {
  session: SessionData;
  onReturnToCockpit: () => void;
}

const TABLE_LABELS: Array<{ key: TableKey; label: string }> = [
  { key: "bookings", label: "Bookings" },
  { key: "transactions", label: "Transactions" },
  { key: "inspections", label: "Inspections" },
  { key: "disputes", label: "Disputes" },
  { key: "assets", label: "Assets" },
  { key: "customers", label: "Customers" },
];

const PRESET_PROMPTS = [
  {
    id: "preset-readiness",
    label: "Run check_dispute_evidence_readiness on Booking BK-9021",
    prompt:
      "Run check_dispute_evidence_readiness on Booking BK-9021 and inspect all 4 representment pillars.",
    runReadinessTool: true,
  },
  {
    id: "preset-rates",
    label: "Explain our Deposit Recovery Rate (% of Priced) and Dispute Win Rate",
    prompt:
      "Explain our Deposit Recovery Rate (% of Priced) and Dispute Win Rate based on the 6 session tables.",
    runReadinessTool: false,
  },
  {
    id: "preset-audit",
    label: "Audit all Braintree transactions and Channel3 retail price proofs",
    prompt:
      "Audit all Braintree transactions and Channel3 retail price proofs across the current bookings.",
    runReadinessTool: false,
  },
];

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);
  const escape = (val: unknown) => {
    const s = val === null || val === undefined ? "" : String(val);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AgStudioWorkspace({
  session,
  onReturnToCockpit,
}: AgStudioWorkspaceProps) {
  const [studioMode, setStudioMode] = useState<"view" | "edit">("edit");
  const [activeTable, setActiveTable] = useState<TableKey>("transactions");
  const [bookingFilter, setBookingFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [chatInput, setChatInput] = useState<string>("");
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [streaming, setStreaming] = useState<boolean>(false);
  const [readinessPreview, setReadinessPreview] =
    useState<DisputeReadinessReport>(() =>
      checkDisputeEvidenceReadiness(session, "BK-9021")
    );

  const snapshot = useMemo(() => buildStudioTabularSnapshot(session), [session]);

  const activeRows = useMemo(() => {
    const raw = snapshot[activeTable] as unknown as Array<
      Record<string, unknown>
    >;
    return raw.filter((row) => {
      if (bookingFilter !== "ALL") {
        const bId =
          activeTable === "bookings"
            ? String(row.id ?? "")
            : typeof row.bookingId === "string"
              ? row.bookingId
              : null;
        if (bId && bId !== bookingFilter) return false;
      }
      if (!searchQuery.trim()) return true;
      const needle = searchQuery.toLowerCase();
      return Object.values(row).some((v) =>
        String(v ?? "").toLowerCase().includes(needle)
      );
    });
  }, [snapshot, activeTable, bookingFilter, searchQuery]);

  const [inspectRecordId, setInspectRecordId] = useState<string | null>(null);

  const sendAssistantPrompt = async (
    promptText: string,
    includeReadinessTool = false
  ) => {
    const clean = promptText.trim();
    if (!clean || streaming) return;

    const shouldAuditReadiness =
      includeReadinessTool ||
      clean.toLowerCase().includes("readiness") ||
      clean.toLowerCase().includes("check_dispute_evidence_readiness") ||
      clean.toLowerCase().includes("dispute");

    const latestReport = shouldAuditReadiness
      ? checkDisputeEvidenceReadiness(
          session,
          bookingFilter === "ALL" ? "BK-9021" : bookingFilter
        )
      : undefined;

    if (latestReport) {
      setReadinessPreview(latestReport);
    }

    const userTurn: ChatTurn = {
      id: `u_${Date.now()}`,
      role: "user",
      text: clean,
    };
    const assistantId = `a_${Date.now() + 1}`;
    const placeholderAssistant: ChatTurn = {
      id: assistantId,
      role: "assistant",
      text: "",
      toolVerified: Boolean(latestReport),
      readinessReport: latestReport,
    };

    const history = chatTurns.map((t) => ({
      role: t.role,
      text: t.text,
    }));

    setChatTurns((prev) => [...prev, userTurn, placeholderAssistant]);
    setChatInput("");
    setStreaming(true);

    try {
      const result = await streamNovaAssistantTurn({
        prompt: clean,
        history,
        callbacks: {
          onMeta: (modelUsed) => {
            setChatTurns((prev) =>
              prev.map((t) => (t.id === assistantId ? { ...t, modelUsed } : t))
            );
          },
          onToolResult: () => {
            setChatTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId ? { ...t, toolVerified: true } : t
              )
            );
          },
          onDelta: (delta) => {
            setChatTurns((prev) =>
              prev.map((t) =>
                t.id === assistantId ? { ...t, text: t.text + delta } : t
              )
            );
          },
        },
      });

      if (result.rateLimited) {
        setChatTurns((prev) =>
          prev.map((t) =>
            t.id === assistantId
              ? {
                  ...t,
                  text: result.fullText,
                  modelUsed: "rate-limited",
                  rateLimited: true,
                }
              : t
          )
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Nova Studio Assistant stream failed.";
      setChatTurns((prev) =>
        prev.map((t) => (t.id === assistantId ? { ...t, text: msg } : t))
      );
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-800 bg-[#121826] px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <BarChart3 className="h-5 w-5 text-violet-400" />
            <h2 className="text-base font-semibold text-white">
              AG Studio 3.1 — 6-Table Relational Analytics &amp; Amazon Nova
              Assistant
            </h2>
            <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
              ag-studio@3.1.0 + Bedrock Nova
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Live relational workspace bound to all 6 session tables with
            read-only dispute readiness tooling.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="AG Studio Mode"
            className="inline-flex rounded-lg border border-gray-700 bg-[#090D16] p-0.5 text-xs"
          >
            {(["view", "edit"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setStudioMode(m)}
                className={`rounded-md px-3 py-1 font-medium capitalize transition ${
                  studioMode === m
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {m} mode
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onReturnToCockpit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-[#090D16] px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Fleet Cockpit
          </button>
        </div>
      </div>

      {/* Custom DepositHealthWidget Financial KPI Strip */}
      <DepositHealthWidget session={session} />

      {/* Dual-Assurance Grid: Amazon Nova Assistant + Read-Only Readiness Auditor */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left 7 cols: Amazon Nova Studio AI Assistant */}
        <section
          aria-label="Amazon Nova Studio AI Assistant"
          className="flex flex-col rounded-xl border border-gray-800 bg-[#121826] p-4 xl:col-span-7"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-gray-100">
                Amazon Nova BI &amp; Dispute Readiness Assistant
              </h3>
            </div>
            <span className="rounded-md border border-gray-700 bg-[#0B0F19] px-2 py-0.5 font-mono text-[10px] text-gray-400">
              POST /api/ai/nova-stream
            </span>
          </div>

          {/* 1-Click Presets */}
          <div className="mb-3 flex flex-wrap gap-2">
            {PRESET_PROMPTS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={streaming}
                onClick={() =>
                  void sendAssistantPrompt(
                    preset.prompt,
                    preset.runReadinessTool
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-left text-[11px] font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
              >
                <Wrench className="h-3 w-3 shrink-0 text-violet-300" />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>

          {/* Chat Stream Feed */}
          <div className="mb-3 h-[260px] space-y-3 overflow-y-auto rounded-xl border border-gray-800 bg-[#090D16] p-3">
            {chatTurns.length === 0 ? (
              <p className="py-12 text-center text-xs text-gray-500">
                Click a preset above or ask Amazon Nova about active deposit
                holds, Channel3 recovery rates, or dispute readiness.
              </p>
            ) : (
              chatTurns.map((turn) => (
                <div
                  key={turn.id}
                  className={`rounded-lg p-3 text-xs ${
                    turn.role === "user"
                      ? "ml-8 border border-blue-500/30 bg-blue-950/30 text-blue-100"
                      : turn.rateLimited
                        ? "mr-4 border border-amber-500/50 bg-amber-950/30 text-amber-200"
                        : "mr-4 border border-gray-800 bg-[#121826] text-gray-200"
                  }`}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold uppercase tracking-wide text-[10px] text-gray-400">
                      {turn.role === "user" ? "Operator" : "Studio Assistant"}
                    </span>
                    {turn.toolVerified && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        [Tool Call: check_dispute_evidence_readiness &rarr;
                        Verified]
                      </span>
                    )}
                    {turn.modelUsed && (
                      <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-violet-300">
                        {turn.modelUsed}
                      </span>
                    )}
                    {turn.rateLimited && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                        <AlertTriangle className="h-3 w-3" />
                        HTTP 429 Rate Limit
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {turn.text || (streaming ? "Streaming response..." : "")}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Prompt Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendAssistantPrompt(chatInput);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask Nova about bookings, holds, Channel3 pricing, or dispute evidence..."
              className="flex-1 rounded-lg border border-gray-700 bg-[#090D16] px-3 py-2 text-xs text-gray-100 placeholder:text-gray-500 focus:border-violet-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={streaming || !chatInput.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {streaming ? "Streaming..." : "Ask Nova"}
            </button>
          </form>
        </section>

        {/* Right 5 cols: Deterministic Read-Only Dispute Readiness Audit Card */}
        <section
          aria-label="Dispute Evidence Readiness Audit"
          className="rounded-xl border border-gray-800 bg-[#121826] p-4 xl:col-span-5"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-gray-100">
                `check_dispute_evidence_readiness` (Read-Only)
              </h3>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${
                readinessPreview.readyForRepresentment
                  ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border border-amber-500/40 bg-amber-500/15 text-amber-300"
              }`}
            >
              {readinessPreview.score} Pillars
            </span>
          </div>

          <p className="mb-3 text-xs text-gray-400">
            Live read-only verification for Booking{" "}
            <span className="font-mono text-gray-200">
              {readinessPreview.bookingId}
            </span>
            {readinessPreview.disputeId
              ? ` / Dispute ${readinessPreview.disputeId}`
              : ""}
            . Zero state mutations.
          </p>

          <div className="space-y-2">
            {readinessPreview.pillars.map((pillar) => (
              <div
                key={pillar.key}
                className={`rounded-lg border p-2.5 text-xs ${
                  pillar.passed
                    ? "border-emerald-500/30 bg-emerald-950/15"
                    : "border-gray-800 bg-[#090D16]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-100">
                    {pillar.label}
                  </span>
                  {pillar.passed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-gray-500" />
                  )}
                </div>
                <p className="mt-1 text-[11px] text-gray-400">{pillar.detail}</p>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setReadinessPreview(
                checkDisputeEvidenceReadiness(
                  session,
                  bookingFilter === "ALL" ? "BK-9021" : bookingFilter
                )
              )
            }
            className="mt-3 w-full rounded-lg border border-gray-700 bg-[#090D16] px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800"
          >
            Refresh Read-Only Pillar Check
          </button>
        </section>
      </div>

      {/* View Mode: Executive Visual BI Dashboard | Edit Mode: AG Studio 3.1 Custom Report & Widget Builder */}
      {studioMode === "view" ? (
        <section
          aria-label="Executive Financial & Fleet BI Dashboard"
          className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        >
          {/* Card 1: Authorized Holds vs. Captured Recovery vs. Uncaptured Remainder */}
          <div className="rounded-xl border border-gray-800 bg-[#121826] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-300">
              Deposit Holds vs. Captured Recovery
            </h3>
            <div className="mt-3 space-y-3">
              {session.bookings.map((bk) => {
                const captured = session.transactions
                  .filter(
                    (t) =>
                      t.bookingId === bk.id && t.type === "partial_settlement"
                  )
                  .reduce((sum, t) => sum + t.amountCents, 0);
                const pct =
                  bk.depositHoldCents > 0
                    ? Math.min(100, Math.round((captured / bk.depositHoldCents) * 100))
                    : 0;
                const remainder = Math.max(0, bk.depositHoldCents - captured);
                return (
                  <div key={bk.id} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-white">
                        {bk.id}
                      </span>
                      <span className="font-mono text-[11px] text-gray-300">
                        {formatUsdCents(captured)} / {formatUsdCents(bk.depositHoldCents)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400">
                      Uncaptured Remainder: {formatUsdCents(remainder)} ({bk.authStatus})
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 2: Asset Revenue & Maintenance Status */}
          <div className="rounded-xl border border-gray-800 bg-[#121826] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-300">
              Asset Revenue &amp; Maintenance Status
            </h3>
            <div className="mt-3 space-y-2.5">
              {session.assets.map((asset) => {
                const revCents = session.bookings
                  .filter((b) => b.assetId === asset.id)
                  .reduce((sum, b) => sum + b.rentalFeeCents, 0);
                return (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between rounded-lg border border-gray-800 bg-[#090D16] px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="truncate font-medium text-gray-100">
                        {asset.name}
                      </p>
                      <p className="font-mono text-[10px] text-gray-400">
                        {formatUsdCents(asset.dailyRateCents)}/day &middot; Rev:{" "}
                        {formatUsdCents(revCents)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        asset.status === "maintenance"
                          ? "bg-amber-500/20 text-amber-300"
                          : asset.status === "rented"
                            ? "bg-blue-500/20 text-blue-300"
                            : "bg-emerald-500/20 text-emerald-300"
                      }`}
                    >
                      {asset.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 3: Dispute Win Rate & Recovery Summary */}
          <div className="rounded-xl border border-gray-800 bg-[#121826] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-300">
              Dispute Win Rate &amp; Recovery Summary
            </h3>
            <div className="mt-3 space-y-3 text-xs">
              {(() => {
                const totalDisputes = session.disputes.length;
                const wonDisputes = session.disputes.filter(
                  (d) => d.status === "Won"
                ).length;
                const winRate =
                  totalDisputes > 0
                    ? Math.round((wonDisputes / totalDisputes) * 100)
                    : 100;
                const totalDisputedCents = session.disputes.reduce(
                  (sum, d) => sum + d.amountDisputedCents,
                  0
                );
                return (
                  <>
                    <div className="flex items-baseline justify-between rounded-lg border border-gray-800 bg-[#090D16] p-3">
                      <div>
                        <p className="text-[10px] uppercase text-gray-400">
                          Representment Win Rate
                        </p>
                        <p className="mt-1 font-mono text-2xl font-bold text-emerald-300">
                          {winRate}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase text-gray-400">
                          Total Defended
                        </p>
                        <p className="mt-1 font-mono text-base font-semibold text-white">
                          {formatUsdCents(totalDisputedCents)}
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {totalDisputes === 0
                        ? "No active disputes yet. Trigger Step 6 in the Fleet Cockpit to populate live representment recovery."
                        : `${wonDisputes} of ${totalDisputes} disputes finalized as Won with grounded Channel3 price proof.`}
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
        </section>
      ) : (
        <section
          aria-label="AG Studio 3.1 Custom Report & Widget Builder"
          className="grid grid-cols-1 gap-4 xl:grid-cols-12"
        >
          <div className="xl:col-span-8">
            <AgStudioInner session={session} mode="edit" />
          </div>
          <div className="flex flex-col rounded-xl border border-gray-800 bg-[#121826] p-4 xl:col-span-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-300">
              Active Data Preview ({activeTable})
            </h3>
            <p className="mt-1 text-[11px] text-gray-400">
              Live snapshot of {activeRows.length} rows bound to AG Studio 3.1
            </p>
            <div className="mt-3 flex-1 space-y-2 overflow-y-auto max-h-[540px]">
              {activeRows.slice(0, 8).map((row, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-gray-800 bg-[#090D16] p-2.5 font-mono text-[11px] text-gray-200"
                >
                  {Object.entries(row)
                    .slice(0, 4)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2 truncate">
                        <span className="text-gray-400">{formatColumnHeader(k)}:</span>
                        <span className="truncate text-white">
                          {USD_COLUMNS.has(k) && typeof v === "number"
                            ? formatUsdCents(Math.round(v * 100))
                            : String(v ?? "—")}
                        </span>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Live 6-Table Operational Ledger Explorer */}
      <section
        aria-label="Live 6-Table Operational Ledger Explorer"
        className="rounded-xl border border-gray-800 bg-[#121826] p-4"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-gray-100">
              Live 6-Table Operational Ledger Explorer
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Cross-filter by booking ID"
              value={bookingFilter}
              onChange={(e) => setBookingFilter(e.target.value)}
              className="rounded-lg border border-gray-700 bg-[#090D16] px-2.5 py-1.5 text-xs text-gray-200 focus:border-blue-400 focus:outline-none"
            >
              <option value="ALL">All Bookings</option>
              {session.bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  Filter: {b.id} ({b.scheduleStatus})
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter rows..."
                className="rounded-lg border border-gray-700 bg-[#090D16] py-1.5 pl-8 pr-3 text-xs text-gray-100 placeholder:text-gray-500 focus:border-blue-400 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => downloadCsv(`aegisflow-${activeTable}.csv`, activeRows)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-[#090D16] px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Table Switcher */}
        <div className="mb-3 flex flex-wrap gap-1.5 border-b border-gray-800 pb-3">
          {TABLE_LABELS.map((tbl) => {
            const count = snapshot[tbl.key].length;
            return (
              <button
                key={tbl.key}
                type="button"
                onClick={() => setActiveTable(tbl.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activeTable === tbl.key
                    ? "bg-blue-600 text-white"
                    : "border border-gray-800 bg-[#090D16] text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span>{tbl.label}</span>
                <span className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Responsive Row Grid */}
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-[#090D16]">
          {activeRows.length === 0 ? (
            <p className="p-6 text-center text-xs text-gray-500">
              No matching rows in `{activeTable}` for the current filter.
            </p>
          ) : (
            <table className="min-w-full divide-y divide-gray-800 text-left text-xs">
              <thead className="bg-[#111827] text-[10px] uppercase tracking-wider text-gray-400">
                <tr>
                  {Object.keys(activeRows[0]!).map((col) => (
                    <th key={col} className="whitespace-nowrap px-3 py-2">
                      {formatColumnHeader(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/70 text-gray-200">
                {activeRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#121826]">
                    {Object.entries(row).map(([col, val]) => {
                      const strVal =
                        val === null || val === undefined ? "—" : String(val);
                      const isUrl =
                        (col.includes("Url") || col.includes("Proof")) &&
                        strVal.startsWith("https://");
                      const isBraintreeId =
                        col === "braintreeId" || col === "braintreeDisputeId";
                      const isUsdCol =
                        USD_COLUMNS.has(col) && typeof val === "number";

                      return (
                        <td
                          key={col}
                          className="max-w-[240px] truncate whitespace-nowrap px-3 py-2 font-mono text-[11px]"
                        >
                          {isUrl ? (
                            <a
                              href={strVal}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-400 hover:underline"
                            >
                              Proof Link
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : isBraintreeId && strVal !== "—" ? (
                            strVal.startsWith("bt_seed_") ? (
                              <span className="rounded bg-emerald-950/50 px-1.5 py-0.5 text-[10px] text-emerald-300">
                                Seed Fixture
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setInspectRecordId(strVal)}
                                className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200 hover:underline"
                              >
                                {strVal}
                                <ShieldCheck className="h-3 w-3" />
                              </button>
                            )
                          ) : isUsdCol ? (
                            formatUsdCents(Math.round((val as number) * 100))
                          ) : (
                            strVal
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Transparent Hackathon Waiver Disclosure */}
      <footer className="rounded-lg border border-gray-800 bg-[#090D16] px-4 py-2.5 text-[11px] text-gray-400">
        <strong>BI Engine Disclosure:</strong> Analytics
        workspace powered by <code className="text-gray-300">ag-studio@3.1.0</code>{" "}
        and <code className="text-gray-300">ag-studio-react@3.1.0</code> under the
        official Sponsor Hackathon evaluation license waiver, wired to Amazon
        Bedrock Nova streaming via our custom <code className="text-gray-300">AgLlmAdapter</code>.
      </footer>

      <BraintreeInspectorModal
        recordId={inspectRecordId}
        onClose={() => setInspectRecordId(null)}
      />
    </div>
  );
}

