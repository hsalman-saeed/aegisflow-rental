import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonWithSession,
  resolveSessionContext,
} from "@/lib/api/session-http";
import { draftDisputeRepresentmentWithNova } from "@/lib/bedrock/client";
import { buildDeterministicEvidenceFacts } from "@/lib/domain/evidence-validator";
import { appendEventLog, saveSession } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ctx = await resolveSessionContext(req);
  const rateBlocked = await enforceRateLimit(req, ctx.sessionId);
  if (rateBlocked) return rateBlocked;

  const body = (await req.json().catch(() => ({}))) as { disputeId?: string };
  if (!body.disputeId) {
    return jsonError("Missing disputeId.", 400);
  }

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
      (t) =>
        t.bookingId === dispute.bookingId && t.type === "auth_hold"
    ) ?? childTxn;

  const disputedItem =
    inspection?.items.find(
      (it) =>
        it.childTransactionId === childTxn?.braintreeId ||
        it.capturedAmountCents === dispute.amountDisputedCents
    ) ?? inspection?.items.find((it) => it.type !== "ok");

  if (!booking || !customer || !inspection || !childTxn || !parentTxn || !disputedItem) {
    return jsonError("Incomplete ground-truth records for dispute representment.", 400);
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

  const drafted = await draftDisputeRepresentmentWithNova(facts);

  const nextDisputes = ctx.data.disputes.map((d) =>
    d.id === dispute.id
      ? {
          ...d,
          evidencePacketSummary: drafted.evidenceText,
          submissionStep: "draft" as const,
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
      actorRole: "System / AI",
      action: "DISPUTE_EVIDENCE_DRAFTED",
      entityType: "dispute",
      entityId: dispute.id,
      metadata: {
        modelUsed: drafted.modelUsed,
        validated: drafted.validated,
      },
    },
    next
  );

  return jsonWithSession(
    {
      evidenceText: drafted.evidenceText,
      facts,
      modelUsed: drafted.modelUsed,
      data: next,
    },
    ctx
  );
}

