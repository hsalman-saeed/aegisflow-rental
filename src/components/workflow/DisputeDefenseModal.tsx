"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Cpu,
  FileCheck2,
  FileText,
  Scale,
  Send,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { formatUsdCents, postApiJson } from "@/lib/ui/api-client";
import { BraintreeIdPill } from "@/components/workflow/BraintreeIdPill";
import type { Dispute, SessionData } from "@/types/domain";

interface SimulateDisputeResponse {
  dispute: Dispute;
  data: SessionData;
}

interface DraftEvidenceFacts {
  bookingId: string;
  customerCompany: string;
  depositHoldFormatted: string;
  assetId: string;
  rentalFeeFormatted: string;
  signOffTimestamp: string;
  disputedItemName: string;
  childBraintreeId: string;
  channel3ReplacementFormatted: string;
  sandboxDisputeTriggerDeltaCents: number;
  sandboxDisputeTriggerDeltaFormatted: string;
  disputedAmountFormatted: string;
  channel3ProductTitle: string;
  channel3RetailUrl: string;
  disputeId: string;
}

interface DraftEvidenceResponse {
  evidenceText: string;
  facts: DraftEvidenceFacts;
  modelUsed: string;
  data: SessionData;
}

interface SubmitDisputeResponse {
  status: "Won" | "Open" | "Lost";
  submissionStep: "finalized";
  sentinelIncluded: boolean;
  data: SessionData;
}

interface DisputeDefenseModalProps {
  session: SessionData;
  bookingId: string;
  onSessionUpdate: (data: SessionData) => void;
  onOpenStudioTab: () => void;
}

export function DisputeDefenseModal({
  session,
  bookingId,
  onSessionUpdate,
  onOpenStudioTab,
}: DisputeDefenseModalProps) {
  const [showRawEditor, setShowRawEditor] = useState(false);
  const booking =
    session.bookings.find((b) => b.id === bookingId) ?? session.bookings[0];

  const settledChildTxns = session.transactions.filter(
    (t) =>
      t.bookingId === booking?.id &&
      t.type === "partial_settlement" &&
      t.status === "settled"
  );

  const activeDispute =
    session.disputes.find((d) => d.bookingId === booking?.id) ??
    session.disputes[0];

  const [selectedChildTxnId, setSelectedChildTxnId] = useState<string>(
    settledChildTxns[0]?.id ?? ""
  );
  const [draftText, setDraftText] = useState<string>(
    activeDispute?.evidencePacketSummary ?? ""
  );
  const [facts, setFacts] = useState<DraftEvidenceFacts | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [sentinelIncluded, setSentinelIncluded] = useState<boolean>(false);

  const [simulating, setSimulating] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedChildTxnId && settledChildTxns[0]?.id) {
      setSelectedChildTxnId(settledChildTxns[0].id);
    }
  }, [settledChildTxns, selectedChildTxnId]);

  useEffect(() => {
    if (activeDispute?.evidencePacketSummary && !draftText) {
      setDraftText(activeDispute.evidencePacketSummary);
    }
  }, [activeDispute?.evidencePacketSummary, draftText]);

  const handleSimulateDispute = async () => {
    if (!booking) return;
    setErrorMsg(null);
    setStatusNotice(null);
    setSimulating(true);
    try {
      const { ok, data: res } = await postApiJson<
        SimulateDisputeResponse & { error?: string }
      >("/api/braintree/dispute/simulate", {
        bookingId: booking.id,
        ...(selectedChildTxnId ? { childTxnId: selectedChildTxnId } : {}),
      });
      if (!ok || !res.data) {
        setErrorMsg(res.error ?? "Failed to create sandbox dispute.");
        return;
      }
      onSessionUpdate(res.data);
      setDraftText(res.dispute.evidencePacketSummary ?? "");
      setStatusNotice(
        `Opened Braintree Sandbox Dispute ${res.dispute.braintreeDisputeId} for ${formatUsdCents(res.dispute.amountDisputedCents)}.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to create sandbox dispute."
      );
    } finally {
      setSimulating(false);
    }
  };

  const handleDraftEvidence = async () => {
    if (!activeDispute) return;
    setErrorMsg(null);
    setStatusNotice(null);
    setDrafting(true);
    try {
      const { ok, data: res } = await postApiJson<
        DraftEvidenceResponse & { error?: string }
      >("/api/braintree/dispute/draft-evidence", {
        disputeId: activeDispute.id,
      });
      if (!ok || !res.data) {
        setErrorMsg(res.error ?? "Failed to draft representment packet.");
        return;
      }
      onSessionUpdate(res.data);
      setDraftText(res.evidenceText);
      setFacts(res.facts);
      setModelUsed(res.modelUsed);
      setStatusNotice(
        `Drafted grounded 4-section representment brief (${res.modelUsed}). Review or edit below before submission.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to draft representment packet."
      );
    } finally {
      setDrafting(false);
    }
  };

  const handleSubmitEvidence = async () => {
    if (!activeDispute || !draftText.trim()) return;
    setErrorMsg(null);
    setStatusNotice(null);
    setSubmitting(true);
    try {
      const { ok, data: res } = await postApiJson<
        SubmitDisputeResponse & { error?: string; mismatches?: string[] }
      >("/api/braintree/dispute/submit", {
        disputeId: activeDispute.id,
        approvedText: draftText.trim(),
      });
      if (!ok || !res.data) {
        const detail =
          res.mismatches && res.mismatches.length > 0
            ? ` (${res.mismatches.join("; ")})`
            : "";
        setErrorMsg(
          `${res.error ?? "Evidence packet failed ground-truth validation or Braintree submission."}${detail}`
        );
        return;
      }
      onSessionUpdate(res.data);
      setSentinelIncluded(res.sentinelIncluded);
      setStatusNotice(
        `Representment finalized in Braintree Sandbox! Dispute ${activeDispute.braintreeDisputeId} outcome: ${res.status}.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Evidence packet failed validation or Braintree submission."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isNovaModel =
    Boolean(modelUsed) &&
    (modelUsed!.toLowerCase().includes("nova") ||
      modelUsed!.toLowerCase().includes("amazon"));

  const isFinalized =
    activeDispute?.submissionStep === "finalized" ||
    activeDispute?.status === "Won";

  const step1Done = Boolean(activeDispute);
  const step2Done = Boolean(draftText.trim().length > 0);
  const step3Done = isFinalized;

  return (
    <section
      aria-labelledby="dispute-defense-heading"
      className="rounded-xl border border-gray-800 bg-[#121826] p-5"
    >
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/20 text-xs font-bold text-rose-300">
              6
            </span>
            <h2
              id="dispute-defense-heading"
              className="text-base font-semibold text-gray-100"
            >
              Dispute Center &amp; Grounded Representment Defense
            </h2>
            {activeDispute && (
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                  activeDispute.status === "Won"
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                    : activeDispute.status === "Lost"
                      ? "border-red-500/50 bg-red-500/15 text-red-300"
                      : "border-rose-500/50 bg-rose-500/15 text-rose-300"
                }`}
              >
                Status: {activeDispute.status}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Defend partial-settlement deductions against customer chargebacks
            using signed yard inspections and timestamped Channel3 retail price
            proof.
          </p>
        </div>

        {activeDispute?.braintreeDisputeId && (
          <BraintreeIdPill
            label="Braintree Dispute"
            idValue={activeDispute.braintreeDisputeId}
          />
        )}
      </div>

      {/* 3-Step Progression Tracker */}
      <div className="mb-5 grid grid-cols-1 gap-2 rounded-xl border border-gray-800 bg-[#0B0F19] p-3 sm:grid-cols-3">
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
            step1Done
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border border-gray-800 text-gray-400"
          }`}
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>1. Dispute Opened (Sandbox)</span>
        </div>
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
            step2Done
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border border-gray-800 text-gray-400"
          }`}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span>2. Grounded Packet Drafted</span>
        </div>
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
            step3Done
              ? "border border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-200"
              : "border border-gray-800 text-gray-400"
          }`}
        >
          <Scale className="h-4 w-4 shrink-0" />
          <span>
            3. Finalized ({activeDispute?.status ?? "Pending"})
          </span>
        </div>
      </div>

      {/* Braintree Sandbox Dispute Simulation & Representment Mode */}
      <div
        role="note"
        className="mb-4 rounded-xl border border-amber-500/40 bg-amber-950/20 p-3.5 text-xs text-amber-100"
      >
        <p className="font-semibold text-amber-300">
          Braintree Sandbox Dispute Simulation &amp; Representment Mode
        </p>
        <p className="mt-1 leading-relaxed text-amber-100/90">
          In Braintree Sandbox, submitting a dispute packet passes the official
          sandbox sentinel token (
          <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[11px] text-amber-200">
            compelling_evidence
          </code>
          ) alongside our verified narrative so Braintree transitions the
          sandbox dispute to <strong className="text-emerald-300">Won</strong>.
          In production, issuer banks adjudicate evidence manually under card
          network timelines.
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {statusNotice && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Substep 6.1: Simulate Chargeback Dispute */}
      {!activeDispute ? (
        <div className="rounded-xl border border-gray-800 bg-[#0B0F19] p-4">
          <h3 className="text-sm font-semibold text-gray-100">
            Substep 6.1 — Trigger Sandbox Chargeback on Settled Deduction
          </h3>
          <p className="mt-1 text-xs text-gray-400">
            Select a settled partial-capture transaction to simulate a customer
            chargeback notification via Braintree Sandbox.
          </p>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={selectedChildTxnId}
              onChange={(e) => setSelectedChildTxnId(e.target.value)}
              disabled={settledChildTxns.length === 0}
              className="flex-1 rounded-lg border border-gray-700 bg-[#121826] px-3 py-2 text-xs text-gray-100 focus:border-rose-400 focus:outline-none"
            >
              {settledChildTxns.length === 0 ? (
                <option value="">
                  No settled child transactions on {booking?.id} yet (fallback
                  sandbox test enabled)
                </option>
              ) : (
                settledChildTxns.map((txn) => (
                  <option key={txn.id} value={txn.id}>
                    {txn.braintreeId} &middot; {formatUsdCents(txn.amountCents)}{" "}
                    ({txn.captureMode ?? txn.paymentMethod})
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              disabled={simulating || !booking}
              onClick={handleSimulateDispute}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {simulating
                ? "Creating Sandbox Dispute..."
                : "Simulate Chargeback Dispute"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active Dispute Summary & Sandbox Trigger Rail */}
          <div className="rounded-xl border border-gray-800 bg-[#0B0F19] p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">
                  Disputed Amount
                </p>
                <p className="mt-1 font-mono text-base font-bold text-rose-300">
                  {formatUsdCents(activeDispute.amountDisputedCents)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">
                  Reason Code
                </p>
                <p className="mt-1 text-xs font-medium text-gray-200">
                  {activeDispute.reason}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">
                  Reply-By Deadline
                </p>
                <p className="mt-1 font-mono text-xs text-gray-200">
                  {activeDispute.replyByDate}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">
                  SANDBOX TRIGGER RAIL
                </p>
                <p className="mt-1 font-mono text-xs text-amber-300">
                  {activeDispute.triggerMethod === "venmo_6201"
                    ? "Venmo $62.01 Sandbox Dispute Rail"
                    : "Braintree Sandbox Instant Dispute Rail"}
                </p>
              </div>
            </div>
          </div>

          {/* Substep 6.2 & 6.4: Draft, Edit & Submit */}
          <div className="rounded-xl border border-gray-800 bg-[#0B0F19] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-100">
                  Grounded Representment Brief
                </h3>
                <button
                  type="button"
                  onClick={() => setShowRawEditor((v) => !v)}
                  className="rounded border border-gray-700 bg-[#121826] px-2 py-0.5 text-[11px] text-gray-300 hover:bg-gray-800"
                >
                  {showRawEditor ? "Formatted Document View" : "Toggle Raw Text Editor"}
                </button>
                {modelUsed &&
                  (isNovaModel ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/15 px-2.5 py-0.5 text-[11px] font-medium text-violet-200">
                      <Sparkles className="h-3 w-3 text-violet-300" />
                      {modelUsed}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-200">
                      <Cpu className="h-3 w-3 text-amber-300" />
                      Deterministic Grounded Brief ({modelUsed})
                    </span>
                  ))}
              </div>

              {!isFinalized && (
                <button
                  type="button"
                  disabled={drafting}
                  onClick={handleDraftEvidence}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/50 bg-violet-600/20 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-600/30 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {drafting
                    ? "Drafting with Amazon Nova..."
                    : draftText
                      ? "Regenerate Grounded Packet"
                      : "Draft Grounded Packet with Amazon Nova"}
                </button>
              )}
            </div>

            {/* Grounded Facts & Itemized Reconciliation Strip (QA-HARDEN-01) */}
            {facts && (
              <div className="mb-3 space-y-2 rounded-lg border border-gray-800 bg-[#121826] p-3 text-[11px]">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <span className="text-gray-500">Child Braintree Txn:</span>{" "}
                    <span className="font-mono text-emerald-300">
                      {facts.childBraintreeId}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Total Disputed:</span>{" "}
                    <span className="font-mono text-gray-100">
                      {facts.disputedAmountFormatted}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Inspection Sign-Off:</span>{" "}
                    <span className="font-mono text-gray-200">
                      {facts.signOffTimestamp}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Channel3 Proof:</span>{" "}
                    <span className="truncate text-blue-300">
                      {facts.channel3ProductTitle}
                    </span>
                  </div>
                </div>
                {facts.sandboxDisputeTriggerDeltaCents > 0 && (
                  <div className="border-t border-gray-800 pt-2 text-amber-200/90">
                    <strong>Itemized Reconciliation:</strong> Channel3 Retail (
                    <span className="font-mono">
                      {facts.channel3ReplacementFormatted}
                    </span>
                    ) + Expedited Bench Restocking / Braintree Sandbox $62.01
                    Trigger Adjustment (
                    <span className="font-mono">
                      {facts.sandboxDisputeTriggerDeltaFormatted}
                    </span>
                    ) ={" "}
                    <span className="font-mono font-semibold text-white">
                      {facts.disputedAmountFormatted}
                    </span>
                  </div>
                )}
              </div>
            )}

            {showRawEditor || !draftText.trim() ? (
              <textarea
                rows={12}
                value={draftText}
                disabled={isFinalized}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder='Click "Draft Grounded Packet with Amazon Nova" above to generate a verified 4-section representment brief citing only locked booking, inspection, Braintree, and Channel3 ground-truth facts.'
                className="min-h-[300px] w-full rounded-lg border border-gray-700 bg-[#121826] p-3 font-mono text-xs leading-relaxed text-gray-100 placeholder:text-gray-500 focus:border-violet-400 focus:outline-none disabled:opacity-75"
              />
            ) : (
              <div className="min-h-[300px] space-y-3 rounded-lg border border-gray-700 bg-[#121826] p-4 text-xs leading-relaxed text-gray-100">
                {draftText
                  .split(/\n{2,}/)
                  .map((para) => para.trim())
                  .filter(Boolean)
                  .map((para, idx) => (
                    <p key={idx} className="whitespace-pre-wrap">
                      {para}
                    </p>
                  ))}
              </div>
            )}

            {/* Visual 3-Step Braintree Dispute API Pipeline Bar */}
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-gray-800 bg-[#121826] p-2.5 text-[11px] sm:grid-cols-3">
              <div
                className={`rounded border px-2.5 py-1.5 font-mono ${
                  isFinalized
                    ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                    : "border-gray-800 text-gray-400"
                }`}
              >
                Step 1: dispute.addTextEvidence(Grounded Brief)
              </div>
              <div
                className={`rounded border px-2.5 py-1.5 font-mono ${
                  isFinalized
                    ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                    : "border-gray-800 text-gray-400"
                }`}
              >
                Step 2: dispute.addTextEvidence(&quot;compelling_evidence&quot; Sentinel)
              </div>
              <div
                className={`rounded border px-2.5 py-1.5 font-mono font-semibold ${
                  isFinalized
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                    : "border-gray-800 text-gray-400"
                }`}
              >
                Step 3: dispute.finalize(disputeId) &rarr; Status: {activeDispute.status.toUpperCase()}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              {isFinalized ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-300">
                  <FileCheck2 className="h-4 w-4 text-emerald-400" />
                  <span>
                    Representment finalized &amp; submitted
                    {sentinelIncluded
                      ? " (sandbox sentinel verified)."
                      : "."}{" "}
                    Dispute marked <strong>{activeDispute.status}</strong>.
                  </span>
                </div>
              ) : (
                <p className="text-[11px] text-gray-400">
                  Automated Evidence Verification: Confirms all transaction IDs,
                  dollar amounts, and retail proof URLs match recorded session
                  data before submission.
                </p>
              )}

              {!isFinalized ? (
                <button
                  type="button"
                  disabled={submitting || !draftText.trim()}
                  onClick={handleSubmitEvidence}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {submitting
                    ? "Submitting to Braintree..."
                    : "Approve & Submit Representment Packet"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenStudioTab}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Open Tab 2: AG Studio 3.1 Analytics &amp; AI Assistant
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
