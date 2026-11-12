import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonWithSession,
  resolveSessionContext,
} from "@/lib/api/session-http";
import { executePartialDepositCapture } from "@/lib/braintree/client";
import { evaluateDepositCapturePolicy } from "@/lib/domain/policy-gate";
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

  const body = (await req.json().catch(() => ({}))) as {
    itemId?: string;
    bookingId?: string;
    humanApproved?: boolean;
    rejectionReason?: string;
  };

  if (!body.itemId) {
    return jsonError("Missing itemId.", 400);
  }

  const lockKey = `settle:${ctx.sessionId}:${body.itemId}`;
  const acquired = await acquireActionLock(lockKey);
  if (!acquired) {
    return jsonError(
      "Operation already in flight for this record. Duplicate concurrent request blocked.",
      409
    );
  }

  try {
    const inspection = ctx.data.inspections.find(
      (insp) =>
        (!body.bookingId || insp.bookingId === body.bookingId) &&
        insp.items.some((it) => it.id === body.itemId)
    );
    if (!inspection) {
      return jsonError(`Inspection item ${body.itemId} not found.`, 404);
    }

  const item = inspection.items.find((it) => it.id === body.itemId)!;
  const booking = ctx.data.bookings.find((b) => b.id === inspection.bookingId);
  if (!booking) {
    return jsonError(`Booking ${inspection.bookingId} not found.`, 404);
  }
  const customer = ctx.data.customers.find((c) => c.id === booking.customerId);

  const alreadyCapturedItemIds = inspection.items
    .filter((i) => typeof i.capturedAmountCents === "number" && i.capturedAmountCents > 0)
    .map((i) => i.id);
  const existingCapturedCents = inspection.items.reduce(
    (sum, i) => sum + (i.capturedAmountCents ?? 0),
    0
  );

  const decision = evaluateDepositCapturePolicy({
    item,
    inspectionVerified: inspection.inspectorVerified,
    parentAuthStatus: booking.authStatus,
    parentAuthorizedCents: booking.depositHoldCents,
    existingCapturedCents,
    alreadyCapturedItemIds,
    humanApproved: body.humanApproved,
    rejectionReason: body.rejectionReason,
  });

  if (!decision.allowed) {
    if (decision.rejected) {
      const updatedInspections = ctx.data.inspections.map((insp) =>
        insp.id !== inspection.id
          ? insp
          : {
              ...insp,
              items: insp.items.map((it) =>
                it.id === item.id ? { ...it, approvalMode: "rejected" as const } : it
              ),
            }
      );
      let next = await saveSession(ctx.sessionId, {
        ...ctx.data,
        inspections: updatedInspections,
      });
      next = await appendEventLog(
        ctx.sessionId,
        {
          actorRole: "Finance Approver",
          action: "PARTIAL_SETTLEMENT_REJECTED",
          entityType: "inspection",
          entityId: item.id,
          metadata: {
            bookingId: booking.id,
            amountCents: decision.amountCents,
            rejectionReason: decision.rejectionReason,
          },
        },
        next
      );
      return jsonWithSession({ rejected: true, decision, data: next }, ctx);
    }

    const status = decision.requiresApprovalCard ? 403 : 400;
    return jsonError(decision.reason, status, { decision });
  }

  const remainingUnsettledDiscrepancies = inspection.items.filter(
    (it) =>
      it.id !== item.id &&
      it.type !== "ok" &&
      !it.capturedAmountCents &&
      it.approvalMode !== "rejected"
  );
  const isFinalCapture = remainingUnsettledDiscrepancies.length === 0;

  const [firstName = "AegisFlow", ...restName] = (
    customer?.name || "AegisFlow Customer"
  ).split(" ");
  const lastName = restName.join(" ") || "Rental";

  const captureRes = await executePartialDepositCapture({
    parentTransactionId: booking.parentTransactionId || `bt_seed_${booking.id}`,
    amountCents: decision.amountCents,
    orderId: `${booking.id}-${item.id}`,
    isFinalCapture,
    customerFirstName: firstName,
    customerLastName: lastName,
    customerEmail: customer?.email || "customer@example.com",
  });

  const childTxn: Transaction = {
    id: `txn_${randomUUID().slice(0, 8)}`,
    braintreeId: captureRes.childBraintreeId,
    parentTransactionId: booking.parentTransactionId,
    bookingId: booking.id,
    customerId: booking.customerId,
    type: "partial_settlement",
    captureMode: captureRes.captureMode,
    paymentMethod: "Visa",
    amountCents: decision.amountCents,
    signedAmountCents: decision.amountCents,
    status: "settled",
    createdAt: new Date().toISOString(),
  };

  const approvalMode: "auto_under_cap" | "human_approved" =
    decision.route === "auto_under_cap" ? "auto_under_cap" : "human_approved";

  const nextInspections = ctx.data.inspections.map((insp) =>
    insp.id !== inspection.id
      ? insp
      : {
          ...insp,
          items: insp.items.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  capturedAmountCents: decision.amountCents,
                  childTransactionId: captureRes.childBraintreeId,
                  approvalMode,
                }
              : it
          ),
        }
  );

  let next = await saveSession(ctx.sessionId, {
    ...ctx.data,
    inspections: nextInspections,
    transactions: [...ctx.data.transactions, childTxn],
  });
  next = await appendEventLog(
    ctx.sessionId,
    {
      actorRole:
        decision.route === "human_approval" ? "Finance Approver" : "System / AI",
      action: "PARTIAL_SETTLEMENT_CAPTURED",
      entityType: "transaction",
      entityId: childTxn.id,
      metadata: {
        bookingId: booking.id,
        itemId: item.id,
        braintreeId: captureRes.childBraintreeId,
        amountCents: decision.amountCents,
        captureMode: captureRes.captureMode,
        route: decision.route,
        isFinalCapture,
      },
    },
    next
  );

  return jsonWithSession(
    {
      childTxnId: childTxn.id,
      braintreeId: captureRes.childBraintreeId,
      status: childTxn.status,
      captureMode: captureRes.captureMode,
      route: decision.route,
      isFinalCapture,
      data: next,
    },
    ctx
  );
  } finally {
    await releaseActionLock(lockKey);
  }
}

