"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  ExternalLink,
  Gavel,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { formatUsdCents, postApiJson } from "@/lib/ui/api-client";
import { BraintreeIdPill } from "@/components/workflow/BraintreeIdPill";
import type { InspectionItem, SessionData, Transaction } from "@/types/domain";

interface SettlePartialResponse {
  childTxnId?: string;
  braintreeId?: string;
  status?: "settled";
  captureMode?: "partial_settlement" | "fallback_vault_capture";
  route?: "auto_under_cap" | "human_approval";
  isFinalCapture?: boolean;
  rejected?: boolean;
  decision?: unknown;
  data: SessionData;
}

interface PolicyGatePanelProps {
  session: SessionData;
  bookingId: string;
  onSessionUpdate: (data: SessionData) => void;
  onAdvanceStep: () => void;
}

const AUTO_CAPTURE_CAP_CENTS = 10000;

export function PolicyGatePanel({
  session,
  bookingId,
  onSessionUpdate,
  onAdvanceStep,
}: PolicyGatePanelProps) {
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [rejectingItemId, setRejectingItemId] = useState<string | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastCaptureNotice, setLastCaptureNotice] = useState<string | null>(null);

  const booking =
    session.bookings.find((b) => b.id === bookingId) ?? session.bookings[0];
  const inspection =
    session.inspections.find((i) => i.bookingId === booking?.id) ??
    session.inspections[0];

  const discrepancyItems: InspectionItem[] = (inspection?.items ?? []).filter(
    (item) => item.type === "missing" || item.type === "damaged"
  );

  const parentTxn = session.transactions.find(
    (t) =>
      t.bookingId === booking?.id &&
      t.type === "auth_hold" &&
      (t.braintreeId === booking?.parentTransactionId ||
        t.id === booking?.parentTransactionId)
  );

  const childTxns = session.transactions.filter(
    (t) => t.bookingId === booking?.id && t.type === "partial_settlement"
  );

  const totalCapturedCents = childTxns.reduce(
    (acc, txn) => acc + (txn.status === "settled" ? txn.amountCents : 0),
    0
  );
  const holdCents = booking?.depositHoldCents ?? 0;
  const remainingHoldCents = Math.max(0, holdCents - totalCapturedCents);

  const allDiscrepanciesResolved =
    discrepancyItems.length > 0 &&
    discrepancyItems.every(
      (item) =>
        Boolean(item.capturedAmountCents) || item.approvalMode === "rejected"
    );

  const findChildTxn = (item: InspectionItem): Transaction | undefined =>
    childTxns.find(
      (txn) =>
        txn.id === item.childTransactionId ||
        txn.braintreeId === item.childTransactionId
    );

  const handleSettle = async (
    item: InspectionItem,
    humanApproved: boolean,
    rejectionReason?: string
  ) => {
    if (!booking) return;
    setErrorMsg(null);
    setLastCaptureNotice(null);
    setBusyItemId(item.id);
    try {
      const { ok, data: res } = await postApiJson<
        SettlePartialResponse & { error?: string }
      >("/api/braintree/settle-partial", {
        itemId: item.id,
        bookingId: booking.id,
        humanApproved,
        ...(rejectionReason ? { rejectionReason } : {}),
      });
      if (!ok || !res.data) {
        setErrorMsg(res.error ?? "Settlement request failed.");
        return;
      }
      onSessionUpdate(res.data);
      if (res.rejected) {
        setRejectingItemId(null);
        setLastCaptureNotice(
          `Finance Approver rejected deduction for "${item.itemName}". Parent hold untouched.`
        );
      } else {
        setLastCaptureNotice(
          `Settled ${formatUsdCents(item.channel3PriceCents ?? 0)} for "${item.itemName}" via ${
            res.captureMode === "fallback_vault_capture"
              ? "Vault Fallback Capture"
              : "Braintree Partial Settlement"
          }${res.braintreeId ? ` (${res.braintreeId})` : ""}.`
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Settlement request failed."
      );
    } finally {
      setBusyItemId(null);
    }
  };

  return (
    <section
      aria-labelledby="policy-gate-heading"
      className="rounded-xl border border-gray-800 bg-[#121826] p-5"
    >
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-300">
              4
            </span>
            <h2
              id="policy-gate-heading"
              className="text-base font-semibold text-gray-100"
            >
              Step 4 · Deposit Policy Gate &amp; Partial Settlement ($100.00 Auto-Settle Threshold)
            </h2>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Items{" "}
            <span className="font-mono text-gray-200">&le; $100.00</span>{" "}
            auto-settle immediately against the parent deposit hold; items{" "}
            <span className="font-mono text-gray-200">&gt; $100.00</span>{" "}
            require explicit Finance Approver sign-off (`Human Approval Card`).
          </p>
        </div>

        {booking?.parentTransactionId && (
          <BraintreeIdPill
            label="Parent Auth ID"
            idValue={parentTxn?.braintreeId ?? booking.parentTransactionId}
          />
        )}
      </div>

      {/* Deposit Hold Remainder & Closure Ledger */}
      <div className="mb-5 rounded-xl border border-gray-800 bg-[#0B0F19] p-3.5">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-gray-800/80 pb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">
            Deposit Hold Remainder &amp; Closure Ledger
          </span>
          <span className="rounded-full border border-gray-700 bg-gray-900 px-2.5 py-0.5 font-mono text-[10px] text-gray-300">
            Factual Parent Status:{" "}
            <strong className="text-blue-300">
              {booking?.authStatus ?? "pending"}
            </strong>
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400">
              Original Authorized Hold
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-gray-100">
              {formatUsdCents(holdCents)}
            </p>
            <p className="text-[11px] text-gray-500">
              Booking {booking?.id ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400">
              Total Itemized Captures
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-emerald-300">
              {formatUsdCents(totalCapturedCents)}
            </p>
            <p className="text-[11px] text-gray-500">
              {childTxns.length} settled child transaction
              {childTxns.length === 1 ? "" : "s"} (live Channel3 amounts)
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400">
              Uncaptured Remainder
            </p>
            <p className="mt-1 font-mono text-lg font-semibold text-blue-300">
              {formatUsdCents(remainingHoldCents)}
            </p>
            <p className="text-[11px] text-gray-500">
              Held on parent auth until final settlement/release
            </p>
          </div>
        </div>
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

      {lastCaptureNotice && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <span>{lastCaptureNotice}</span>
        </div>
      )}

      {discrepancyItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-700 bg-[#0B0F19] p-5 text-center text-xs text-gray-400">
          No missing or damaged items flagged on{" "}
          <span className="font-mono text-gray-200">{booking?.id}</span>. Complete
          Step 2 &amp; Step 3 first to run policy-gated settlement.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {discrepancyItems.map((item) => {
            const priceCents = item.channel3PriceCents;
            const hasLockedPrice =
              typeof priceCents === "number" && priceCents > 0;
            const isAboveCap =
              hasLockedPrice && priceCents > AUTO_CAPTURE_CAP_CENTS;
            const isSettled = Boolean(item.capturedAmountCents);
            const isRejected = item.approvalMode === "rejected";
            const childTxn = findChildTxn(item);
            const isBusy = busyItemId === item.id;
            const showRejectForm = rejectingItemId === item.id;
            const reasonVal = rejectionReasons[item.id] ?? "";

            return (
              <div
                key={item.id}
                className={`flex flex-col justify-between rounded-xl border p-4 ${
                  isSettled
                    ? "border-emerald-500/40 bg-emerald-950/15"
                    : isRejected
                      ? "border-gray-700 bg-[#0B0F19]/80"
                      : isAboveCap
                        ? "border-amber-500/50 bg-[#0B0F19]"
                        : "border-blue-500/40 bg-[#0B0F19]"
                }`}
              >
                <div>
                  {/* Route Header Badge */}
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                    {isAboveCap ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                        <Gavel className="h-3.5 w-3.5" />
                        Human Approval Card (&gt; $100.00)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-blue-300">
                        <Zap className="h-3.5 w-3.5" />
                        Auto-Settlement Route (&le; $100.00)
                      </span>
                    )}

                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        item.priceSource === "channel3"
                          ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                          : "border border-amber-500/40 bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {item.priceSource === "channel3"
                        ? "Channel3 Verified Price"
                        : "Manual Price Source"}
                    </span>
                  </div>

                  {/* Item Details */}
                  <h3 className="text-sm font-semibold text-gray-100">
                    {item.itemName}
                  </h3>
                  <p className="mt-1 text-xs text-gray-400">
                    {item.channel3ProductTitle ? (
                      <>
                        Locked SKU:{" "}
                        <span className="text-gray-200">
                          {item.channel3ProductTitle}
                        </span>
                      </>
                    ) : (
                      <span className="text-amber-300">
                        No Channel3 SKU locked yet — lock a retail match in Step 3.
                      </span>
                    )}
                  </p>

                  {/* Price & Proof Row */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-800 bg-[#121826] px-3 py-2">
                    <div>
                      <span className="block text-[10px] uppercase tracking-wide text-gray-500">
                        Locked Replacement Amount
                      </span>
                      <span className="font-mono text-base font-bold text-gray-100">
                        {hasLockedPrice ? formatUsdCents(priceCents) : "Pending"}
                      </span>
                    </div>
                    {item.channel3RetailUrl && (
                      <a
                        href={item.channel3RetailUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2 py-1 text-[11px] text-blue-300 hover:bg-gray-800"
                      >
                        Retail Proof
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Settlement Outcome / Actions */}
                <div className="mt-4 border-t border-gray-800 pt-3">
                  {isSettled ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                          <CheckCircle2 className="h-4 w-4" />
                          {item.approvalMode === "human_approved"
                            ? "Human Approved & Captured"
                            : "Auto-Captured Under Cap"}
                        </span>
                        <span className="font-mono text-xs font-semibold text-emerald-200">
                          {formatUsdCents(item.capturedAmountCents ?? 0)}
                        </span>
                      </div>

                      {childTxn && (
                        <div className="flex flex-wrap items-center gap-2">
                          <BraintreeIdPill
                            label="Child Txn"
                            idValue={childTxn.braintreeId}
                          />
                          {childTxn.captureMode && (
                            <span
                              className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                                childTxn.captureMode === "fallback_vault_capture"
                                  ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                              }`}
                            >
                              {childTxn.captureMode === "fallback_vault_capture"
                                ? "fallback_vault_capture"
                                : "partial_settlement"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : isRejected ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Ban className="h-4 w-4 text-gray-500" />
                      <span>
                        Deduction rejected by Finance Approver ($0.00 captured).
                      </span>
                    </div>
                  ) : !hasLockedPrice ? (
                    <p className="text-xs text-amber-300">
                      Lock a Channel3 replacement price in Step 3 to unlock
                      settlement.
                    </p>
                  ) : !isAboveCap ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleSettle(item, false)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      {isBusy
                        ? "Settling Child Transaction..."
                        : `Auto-Capture ${formatUsdCents(priceCents)} Under $100 Cap`}
                    </button>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleSettle(item, true)}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {isBusy
                            ? "Approving & Settling..."
                            : `Approve & Settle ${formatUsdCents(priceCents)}`}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            setRejectingItemId(showRejectForm ? null : item.id)
                          }
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </div>

                      {showRejectForm && (
                        <div className="space-y-2 rounded-lg border border-gray-800 bg-[#121826] p-2.5">
                          <label className="block text-[11px] font-medium text-gray-300">
                            Rejection Reason (required for audit log):
                          </label>
                          <input
                            type="text"
                            value={reasonVal}
                            onChange={(e) =>
                              setRejectionReasons((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            placeholder="e.g., Covered under Studio Protection Waiver"
                            className="w-full rounded-md border border-gray-700 bg-[#090D16] px-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-500 focus:border-red-400 focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={isBusy || reasonVal.trim().length < 3}
                            onClick={() =>
                              handleSettle(item, false, reasonVal.trim())
                            }
                            className="w-full rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Confirm Rejection ($0.00 Capture)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Next Step Footer */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 pt-4">
        <p className="text-xs text-gray-400">
          {allDiscrepanciesResolved
            ? "All flagged discrepancies are resolved. Advance to Step 5 to insert the 48h maintenance block and resolve downstream fleet collisions."
            : "Settle or reject each discrepancy above to complete Step 4."}
        </p>
        <button
          type="button"
          onClick={onAdvanceStep}
          disabled={!allDiscrepanciesResolved}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Step 5: Maintenance &amp; Fleet Conflict
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}
