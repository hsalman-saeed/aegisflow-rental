import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonWithSession,
  resolveSessionContext,
} from "@/lib/api/session-http";
import { authorizeDepositHold } from "@/lib/braintree/client";
import {
  acquireActionLock,
  appendEventLog,
  releaseActionLock,
  saveSession,
} from "@/lib/store";
import type { Transaction } from "@/types/domain";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ctx = await resolveSessionContext(req);
  const rateBlocked = await enforceRateLimit(req, ctx.sessionId);
  if (rateBlocked) return rateBlocked;

  // AC-011-2: Client payload accepts only bookingId & optional paymentRail;
  // server strictly looks up booking.depositHoldCents from the session store.
  const body = (await req.json().catch(() => ({}))) as {
    bookingId?: string;
    paymentRail?: "PayPal" | "Venmo";
  };

  if (!body.bookingId) {
    return jsonError("Missing bookingId.", 400);
  }

  const lockKey = `hold:${ctx.sessionId}:${body.bookingId}`;
  const acquired = await acquireActionLock(lockKey);
  if (!acquired) {
    return jsonError(
      "Operation already in flight for this record. Duplicate concurrent request blocked.",
      409
    );
  }

  try {
    const booking = ctx.data.bookings.find((b) => b.id === body.bookingId);
    if (!booking) {
      return jsonError(`Booking ${body.bookingId} not found.`, 404);
    }

    const holdRes = await authorizeDepositHold({
    bookingId: booking.id,
    amountCents: booking.depositHoldCents,
    paymentRail: body.paymentRail,
  });

  const txn: Transaction = {
    id: `txn_${randomUUID().slice(0, 8)}`,
    braintreeId: holdRes.braintreeId,
    bookingId: booking.id,
    customerId: booking.customerId,
    type: "auth_hold",
    paymentMethod: holdRes.paymentMethodUsed,
    amountCents: booking.depositHoldCents,
    signedAmountCents: 0,
    status: holdRes.success ? "authorized" : "processor_declined",
    createdAt: new Date().toISOString(),
  };

  const nextBookings = ctx.data.bookings.map((b) =>
    b.id === booking.id
      ? {
          ...b,
          authStatus: holdRes.success
            ? ("authorized" as const)
            : ("declined" as const),
          parentTransactionId: holdRes.braintreeId,
          scheduleStatus: holdRes.success
            ? ("confirmed" as const)
            : ("tentative" as const),
        }
      : b
  );

  let next = await saveSession(ctx.sessionId, {
    ...ctx.data,
    bookings: nextBookings,
    transactions: [...ctx.data.transactions, txn],
  });
  next = await appendEventLog(
    ctx.sessionId,
    {
      actorRole: "Yard Manager",
      action: holdRes.success ? "DEPOSIT_HOLD_AUTHORIZED" : "DEPOSIT_HOLD_DECLINED",
      entityType: "transaction",
      entityId: txn.id,
      metadata: {
        bookingId: booking.id,
        braintreeId: holdRes.braintreeId,
        amountCents: booking.depositHoldCents,
        paymentMethodUsed: holdRes.paymentMethodUsed,
        processorCode: holdRes.processorCode,
        fallbackNote: holdRes.fallbackNote,
      },
    },
    next
  );

  return jsonWithSession(
    {
      txnId: txn.id,
      braintreeId: holdRes.braintreeId,
      authStatus: holdRes.success ? "authorized" : "declined",
      processorCode: holdRes.processorCode,
      processorText: holdRes.processorText,
      paymentMethodUsed: holdRes.paymentMethodUsed,
      fallbackNote: holdRes.fallbackNote,
      data: next,
    },
    ctx,
    holdRes.success ? 200 : 402
  );
  } finally {
    await releaseActionLock(lockKey);
  }
}

