"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Lock,
  Plus,
  Send,
} from "lucide-react";
import { BraintreeIdPill } from "@/components/workflow/BraintreeIdPill";
import { formatUsdCents, postApiJson } from "@/lib/ui/api-client";
import type { Asset, Booking, Customer, SessionData, Transaction } from "@/types/domain";

interface BookingHoldPanelProps {
  session: SessionData;
  selectedBookingId: string;
  onSelectBooking: (bookingId: string) => void;
  onSessionUpdate: (data: SessionData) => void;
  onAdvanceStep: () => void;
}

export function BookingHoldPanel({
  session,
  selectedBookingId,
  onSelectBooking,
  onSessionUpdate,
  onAdvanceStep,
}: BookingHoldPanelProps) {
  const [paymentRail, setPaymentRail] = useState<"PayPal" | "Venmo">("PayPal");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    text: string;
    fallbackNote?: string;
  } | null>(null);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newAssetId, setNewAssetId] = useState(session.assets[0]?.id ?? "");
  const [newCustomerId, setNewCustomerId] = useState(session.customers[0]?.id ?? "");
  const [newStart, setNewStart] = useState("2026-11-15T09:00");
  const [newEnd, setNewEnd] = useState("2026-11-16T17:00");

  const selectedBooking: Booking =
    session.bookings.find((b) => b.id === selectedBookingId) ?? session.bookings[0]!;
  const customer: Customer | undefined = session.customers.find(
    (c) => c.id === selectedBooking?.customerId
  );
  const asset: Asset | undefined = session.assets.find(
    (a) => a.id === selectedBooking?.assetId
  );
  const latestHoldTxn: Transaction | undefined = [...session.transactions]
    .reverse()
    .find(
      (t) => t.bookingId === selectedBooking?.id && t.type === "auth_hold"
    );

  const handleAuthorizeHold = async () => {
    if (!selectedBooking) return;
    setBusyAction("hold");
    setFeedback(null);
    try {
      const res = await postApiJson<{
        braintreeId?: string;
        authStatus?: string;
        processorCode?: string;
        processorText?: string;
        paymentMethodUsed?: string;
        fallbackNote?: string;
        error?: string;
        data?: SessionData;
      }>("/api/braintree/hold", {
        bookingId: selectedBooking.id,
        paymentRail,
      });
      if (res.data.data) onSessionUpdate(res.data.data);

      if (res.ok && res.data.authStatus === "authorized") {
        setFeedback({
          kind: "success",
          text: `Authorized ${formatUsdCents(selectedBooking.depositHoldCents)} hold via ${res.data.paymentMethodUsed} (Processor Code ${res.data.processorCode ?? "1000"}). Schedule bar locked GREEN.`,
          fallbackNote: res.data.fallbackNote,
        });
      } else {
        setFeedback({
          kind: "error",
          text: `Hold Declined — Braintree Code ${res.data.processorCode ?? "2000"}: ${res.data.processorText ?? res.data.error ?? "Do Not Honor"}. Equipment dispatch remains locked.`,
          fallbackNote: res.data.fallbackNote,
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleDispatch = async () => {
    if (!selectedBooking) return;
    setBusyAction("dispatch");
    setFeedback(null);
    try {
      const res = await postApiJson<{
        scheduleStatus?: string;
        error?: string;
        data?: SessionData;
      }>("/api/bookings/dispatch", { bookingId: selectedBooking.id });
      if (res.data.data) onSessionUpdate(res.data.data);
      if (res.ok) {
        setFeedback({
          kind: "success",
          text: `Booking ${selectedBooking.id} marked DISPATCHED. Ready for Step 2 return inspection.`,
        });
      } else {
        setFeedback({
          kind: "error",
          text: res.data.error || "Dispatch blocked.",
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction("create");
    setFeedback(null);
    try {
      const res = await postApiJson<{
        booking?: Booking;
        error?: string;
        data?: SessionData;
      }>("/api/bookings", {
        assetId: newAssetId,
        customerId: newCustomerId,
        startDate: new Date(newStart).toISOString(),
        endDate: new Date(newEnd).toISOString(),
      });
      if (res.ok && res.data.booking && res.data.data) {
        onSessionUpdate(res.data.data);
        onSelectBooking(res.data.booking.id);
        setShowNewForm(false);
        setFeedback({
          kind: "success",
          text: `Created tentative booking ${res.data.booking.id}. Authorize deposit hold to confirm slot.`,
        });
      } else {
        setFeedback({
          kind: "error",
          text: res.data.error || "Unable to create booking.",
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  if (!selectedBooking) return null;

  const isAuthorized = selectedBooking.authStatus === "authorized";
  const isDispatched =
    selectedBooking.scheduleStatus === "dispatched" ||
    selectedBooking.scheduleStatus === "returned";

  return (
    <section
      aria-label="Step 1: Deposit Hold and Dispatch Lock"
      className="rounded-xl border border-gray-800 bg-[#111827] p-5 shadow-lg"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-blue-600/20 px-2 py-0.5 text-[11px] font-semibold text-blue-300 ring-1 ring-blue-500/40">
              Step 1 · Security Deposit Authorization &amp; Dispatch Gate
            </span>
            <span className="rounded bg-gray-800 px-2 py-0.5 text-[11px] font-medium text-gray-300">
              Role: Yard Dispatch Manager
            </span>
          </div>
          <h2 className="mt-1.5 text-base font-semibold text-white">
            PayPal / Braintree Security Deposit Authorization Gates Dispatch
          </h2>
        </div>

        <button
          type="button"
          onClick={() => setShowNewForm((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-[#090D16] px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800"
        >
          <Plus className="h-3.5 w-3.5 text-blue-400" />
          {showNewForm ? "Close New Booking" : "+ New Booking"}
        </button>
      </div>

      {/* Scenario Selector Tabs */}
      <div className="mt-4 flex flex-wrap gap-2">
        {session.bookings.map((b) => {
          const bCust = session.customers.find((c) => c.id === b.customerId);
          const bAsset = session.assets.find((a) => a.id === b.assetId);
          const tag =
            b.id === "BK-9021"
              ? "Scenario 1A · $1,500 Hold"
              : b.id === "BK-9022"
                ? "Scenario 1B · $2,000 Decline Test"
                : `${b.scheduleStatus.toUpperCase()}`;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelectBooking(b.id)}
              className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                b.id === selectedBooking.id
                  ? "border-blue-500 bg-blue-950/50 text-white"
                  : "border-gray-800 bg-[#090D16] text-gray-300 hover:bg-gray-800/70"
              }`}
            >
              <div className="font-mono font-semibold">
                {b.id} · {formatUsdCents(b.depositHoldCents)}
              </div>
              <div className="mt-0.5 text-[11px] text-gray-400">
                {bAsset?.name ?? b.assetId} · {bCust?.name ?? b.customerId} ({tag})
              </div>
            </button>
          );
        })}
      </div>

      {showNewForm && (
        <form
          onSubmit={handleCreateBooking}
          className="mt-4 grid gap-3 rounded-lg border border-gray-700 bg-[#090D16] p-4 md:grid-cols-4"
        >
          <div>
            <label className="block text-[11px] text-gray-400">Equipment Unit</label>
            <select
              value={newAssetId}
              onChange={(e) => setNewAssetId(e.target.value)}
              className="mt-1 w-full rounded border border-gray-700 bg-[#111827] px-2.5 py-1.5 text-xs text-white"
            >
              {session.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-400">Customer</label>
            <select
              value={newCustomerId}
              onChange={(e) => setNewCustomerId(e.target.value)}
              className="mt-1 w-full rounded border border-gray-700 bg-[#111827] px-2.5 py-1.5 text-xs text-white"
            >
              {session.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.company})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-400">Start (UTC)</label>
            <input
              type="datetime-local"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className="mt-1 w-full rounded border border-gray-700 bg-[#111827] px-2.5 py-1.5 text-xs text-white"
            />
          </div>
          <div className="flex flex-col justify-between gap-2">
            <div>
              <label className="block text-[11px] text-gray-400">End (UTC)</label>
              <input
                type="datetime-local"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="mt-1 w-full rounded border border-gray-700 bg-[#111827] px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <button
              type="submit"
              disabled={busyAction !== null}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {busyAction === "create" ? "Saving..." : "Create Tentative Booking"}
            </button>
          </div>
        </form>
      )}

      {/* Selected Booking Details & Payment Rail Selector */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-800 bg-[#090D16] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-200">
              Booking Summary · <span className="font-mono">{selectedBooking.id}</span>
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                isAuthorized
                  ? "bg-emerald-950 text-emerald-300 ring-1 ring-emerald-500/40"
                  : selectedBooking.authStatus === "declined"
                    ? "bg-red-950 text-red-300 ring-1 ring-red-500/40"
                    : "bg-amber-950 text-amber-300 ring-1 ring-amber-500/40"
              }`}
            >
              Auth: {selectedBooking.authStatus.toUpperCase()}
            </span>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-gray-400">Renter</dt>
              <dd className="font-medium text-white">
                {customer?.name} · {customer?.company}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400">Equipment Asset</dt>
              <dd className="font-medium text-white">{asset?.name}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Rental Fee</dt>
              <dd className="font-mono text-gray-200">
                {formatUsdCents(selectedBooking.rentalFeeCents)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400">Security Deposit Hold</dt>
              <dd className="font-mono font-bold text-sky-300">
                {formatUsdCents(selectedBooking.depositHoldCents)}
              </dd>
            </div>
          </dl>

          {latestHoldTxn && (
            <div className="mt-3 border-t border-gray-800 pt-3">
              {latestHoldTxn.braintreeId.startsWith("bt_seed_") ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                  Pre-Authorized Seed Hold ({selectedBooking.id})
                </span>
              ) : (
                <BraintreeIdPill
                  label="Braintree Hold ID"
                  idValue={latestHoldTxn.braintreeId}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between rounded-lg border border-gray-800 bg-[#090D16] p-4">
          <div>
            <span className="text-xs font-semibold text-gray-200">
              PayPal Braintree Payment Rail Selection
            </span>
            <div className="mt-2.5 space-y-2 text-xs">
              <label className="flex cursor-pointer items-center gap-2 rounded border border-gray-800 bg-[#111827] px-3 py-2">
                <input
                  type="radio"
                  name="paymentRail"
                  checked={paymentRail === "PayPal"}
                  onChange={() => setPaymentRail("PayPal")}
                  className="accent-blue-500"
                />
                <span>PayPal (Primary — Braintree Sandbox)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded border border-gray-800 bg-[#111827] px-3 py-2">
                <input
                  type="radio"
                  name="paymentRail"
                  checked={paymentRail === "Venmo"}
                  onChange={() => setPaymentRail("Venmo")}
                  className="accent-blue-500"
                />
                <span>Venmo (Official PayPal Service — Rules Sec. 4)</span>
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleAuthorizeHold}
              disabled={busyAction !== null || isAuthorized}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              {busyAction === "hold"
                ? "Authorizing Hold..."
                : isAuthorized
                  ? `Hold Authorized (${formatUsdCents(selectedBooking.depositHoldCents)})`
                  : `Authorize ${formatUsdCents(selectedBooking.depositHoldCents)} ${paymentRail} Security Deposit Hold`}
            </button>

            <button
              type="button"
              onClick={handleDispatch}
              disabled={busyAction !== null || !isAuthorized || isDispatched}
              title={
                !isAuthorized
                  ? "Blocked: Security deposit hold must reach authorized status first."
                  : "Confirm equipment leaves the yard"
              }
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                isAuthorized && !isDispatched
                  ? "bg-emerald-600 text-white hover:bg-emerald-500"
                  : "cursor-not-allowed border border-gray-700 bg-gray-800/80 text-gray-400"
              }`}
            >
              {isAuthorized ? (
                <Send className="h-3.5 w-3.5" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-amber-400" />
              )}
              {isDispatched ? "Dispatched" : "Mark Equipment as Dispatched"}
            </button>

            {isDispatched && (
              <button
                type="button"
                onClick={onAdvanceStep}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-950/40 px-3.5 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-900/50"
              >
                Advance to Step 2: Return Check-In
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`mt-4 flex items-start gap-2.5 rounded-lg border p-3 text-xs ${
            feedback.kind === "success"
              ? "border-emerald-500/40 bg-emerald-950/35 text-emerald-200"
              : "border-red-500/40 bg-red-950/35 text-red-200"
          }`}
        >
          {feedback.kind === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          )}
          <div>
            <p className="font-medium">{feedback.text}</p>
            {feedback.fallbackNote && (
              <p className="mt-1 text-[11px] text-amber-200/90">
                Gateway Note: {feedback.fallbackNote}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

