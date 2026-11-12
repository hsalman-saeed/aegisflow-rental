import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonWithSession,
  resolveSessionContext,
} from "@/lib/api/session-http";
import { submitDisputeEvidenceAndFinalize } from "@/lib/braintree/client";
import {
  buildDeterministicEvidenceFacts,
  validateDraftedEvidencePacket,
} from "@/lib/domain/evidence-validator";
import {
  acquireActionLock,
  appendEventLog,
  releaseActionLock,
  saveSession,
} from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ctx = await resolveSessionContext(req);
  const rateBlocked = await enforceRateLimit(req, ctx.sessionId);
  if (rateBlocked) return rateBlocked;

  const body = (await req.json().catch(() => ({}))) as {
    disputeId?: string;
    approvedText?: string;
  };

  if (!body.disputeId || !body.approvedText) {
    return jsonError("Missing disputeId or approvedText.", 400);
  }

  const lockKey = `dispute-submit:${ctx.sessionId}:${body.disputeId}`;
  const acquired = await acquireActionLock(lockKey);
  if (!acquired) {
    return jsonError(
      "Operation already in flight for this record. Duplicate concurrent request blocked.",
      409
    );
  }

  try {
    const dispute = ctx.data.disputes.find(
      (d) => d.id === body.disputeId || d.braintreeDisputeId === body.disputeId
    );
    if (!dispute) {
      return jsonError(`Dispute ${body.disputeId} not found.`, 404);
    }

  const booking = ctx.data.bookings.find((b) => b.id === dispute.bookingId);
  const customer = ctx.data.customers.find((c) => c.id === dispute.customerId);
  const inspection = ctx.data.inspections.find(
    (i) => i.bookingId === dispute.bookingId
  );
  const childTxn = ctx.data.transactions.find((t) => t.id === dispute.transactionId);
  const parentTxn =
    ctx.data.transactions.find(
      (t) => t.bookingId === dispute.bookingId && t.type === "auth_hold"
    ) ?? childTxn;
  const disputedItem =
    inspection?.items.find(
      (it) =>
        it.childTransactionId === childTxn?.braintreeId ||
        it.capturedAmountCents === dispute.amountDisputedCents
    ) ?? inspection?.items.find((it) => it.type !== "ok");

  if (!booking || !customer || !inspection || !childTxn || !parentTxn || !disputedItem) {
    return jsonError("Missing ground-truth records for dispute submission.", 400);
  }

  const facts = buildDeterministicEvidenceFacts({
    booking,
    customer,
    inspection,
    disputedItem,
    parentTxn,
    childTxn,
    dispute,
  });

  const validation = validateDraftedEvidencePacket(body.approvedText, facts);
  if (!validation.valid) {
    return jsonError(
      "Evidence packet failed ground-truth validation (BR-040).",
      400,
      { mismatches: validation.mismatches }
    );
  }

  const res = await submitDisputeEvidenceAndFinalize({
    braintreeDisputeId: dispute.braintreeDisputeId,
    approvedPacketText: body.approvedText,
  });

  const nextDisputes = ctx.data.disputes.map((d) =>
    d.id === dispute.id
      ? {
          ...d,
          status: res.status,
          evidencePacketSummary: body.approvedText!,
          submissionStep: res.submissionStep,
        }
      : d
  );

  let next = await saveSession(ctx.sessionId, {
    ...ctx.data,
    disputes: nextDisputes,
  });
  next = await appendEventLog(
    ctx.sessionId,
    {
      actorRole: "Finance Approver",
      action: "DISPUTE_FINALIZED",
      entityType: "dispute",
      entityId: dispute.id,
      metadata: {
        braintreeDisputeId: dispute.braintreeDisputeId,
        status: res.status,
        sentinelIncluded: res.sentinelIncluded,
      },
    },
    next
  );

  return jsonWithSession(
    {
      status: res.status,
      submissionStep: res.submissionStep,
      sentinelIncluded: res.sentinelIncluded,
      data: next,
    },
    ctx
  );
  } finally {
    await releaseActionLock(lockKey);
  }
}

