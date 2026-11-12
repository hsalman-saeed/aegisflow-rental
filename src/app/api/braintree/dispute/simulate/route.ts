import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonWithSession,
  resolveSessionContext,
} from "@/lib/api/session-http";
import { simulateSandboxDispute } from "@/lib/braintree/client";
import { appendEventLog, saveSession } from "@/lib/store";
import type { Dispute, Transaction } from "@/types/domain";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ctx = await resolveSessionContext(req);
  const rateBlocked = await enforceRateLimit(req, ctx.sessionId);
  if (rateBlocked) return rateBlocked;

  const body = (await req.json().catch(() => ({}))) as {
    childTxnId?: string;
    bookingId?: string;
  };

  const childTxn = body.childTxnId
    ? ctx.data.transactions.find(
        (t) => t.id === body.childTxnId || t.braintreeId === body.childTxnId
      )
    : ctx.data.transactions.find(
        (t) =>
          t.type === "partial_settlement" &&
          (!body.bookingId || t.bookingId === body.bookingId)
      );

  if (!childTxn) {
    return jsonError(
      "Settled child capture transaction required before simulating a dispute.",
      400
    );
  }

  const booking = ctx.data.bookings.find((b) => b.id === childTxn.bookingId);
  const inspection = ctx.data.inspections.find((i) => i.bookingId === childTxn.bookingId);
  const disputedItem = inspection?.items.find(
    (it) =>
      it.childTransactionId === childTxn.braintreeId ||
      it.capturedAmountCents === childTxn.amountCents
  );

  if (!booking) {
    return jsonError(`Booking ${childTxn.bookingId} not found.`, 404);
  }

  // QA-HARDEN-01: Braintree Sandbox requires $62.01 (6201 cents) for instant
  // Venmo/card dispute triggers; preserve the delta transparently over Channel3 price.
  const disputeTriggerCents =
    childTxn.amountCents < 6201 ? 6201 : childTxn.amountCents;

  const simRes = await simulateSandboxDispute({
    bookingId: booking.id,
    amountCents: disputeTriggerCents,
  });

  const dispTestTxn: Transaction = {
    id: `txn_${randomUUID().slice(0, 8)}`,
    braintreeId: simRes.transactionId,
    bookingId: booking.id,
    customerId: booking.customerId,
    type: "dispute_test",
    paymentMethod: simRes.triggerMethod === "venmo_6201" ? "Venmo" : "Visa",
    amountCents: disputeTriggerCents,
    signedAmountCents: 0,
    status: "settled",
    createdAt: new Date().toISOString(),
  };

  const dispute: Dispute = {
    id: `disp_${randomUUID().slice(0, 8)}`,
    braintreeDisputeId: simRes.braintreeDisputeId,
    transactionId: childTxn.id,
    bookingId: booking.id,
    customerId: booking.customerId,
    amountDisputedCents: disputeTriggerCents,
    reason: simRes.reason,
    status: "Open",
    triggerMethod: simRes.triggerMethod,
    evidencePacketSummary: "",
    channel3ProofUrl:
      disputedItem?.channel3RetailUrl || "https://www.bhphotovideo.com",
    replyByDate: simRes.replyByDate,
    submissionStep: "draft",
  };

  let next = await saveSession(ctx.sessionId, {
    ...ctx.data,
    transactions: [...ctx.data.transactions, dispTestTxn],
    disputes: [...ctx.data.disputes, dispute],
  });
  next = await appendEventLog(
    ctx.sessionId,
    {
      actorRole: "System / AI",
      action: "SANDBOX_DISPUTE_OPENED",
      entityType: "dispute",
      entityId: dispute.id,
      metadata: {
        braintreeDisputeId: dispute.braintreeDisputeId,
        amountDisputedCents: dispute.amountDisputedCents,
        triggerMethod: dispute.triggerMethod,
      },
    },
    next
  );

  return jsonWithSession({ dispute, data: next }, ctx);
}

