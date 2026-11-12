import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  jsonError,
  jsonWithSession,
  resolveSessionContext,
} from "@/lib/api/session-http";
import { intervalsOverlap } from "@/lib/domain/conflict-engine";
import { appendEventLog, saveSession } from "@/lib/store";
import type { Booking } from "@/types/domain";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    assetId?: string;
    customerId?: string;
    startDate?: string;
    endDate?: string;
    depositHoldCents?: number;
  };

  if (!body.assetId || !body.customerId || !body.startDate || !body.endDate) {
    return jsonError(
      "Missing required fields: assetId, customerId, startDate, endDate.",
      400
    );
  }

  const startMs = Date.parse(body.startDate);
  const endMs = Date.parse(body.endDate);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return jsonError("Invalid booking time window.", 400);
  }

  const ctx = await resolveSessionContext(req);
  const asset = ctx.data.assets.find((a) => a.id === body.assetId);
  const customer = ctx.data.customers.find((c) => c.id === body.customerId);
  if (!asset || !customer) {
    return jsonError("Referenced assetId or customerId not found.", 404);
  }

  const overlapsBooking = ctx.data.bookings.some(
    (b) =>
      b.assetId === asset.id &&
      b.scheduleStatus !== "returned" &&
      b.scheduleStatus !== "closed" &&
      intervalsOverlap(b.startDate, b.endDate, body.startDate!, body.endDate!)
  );
  if (overlapsBooking) {
    return jsonError("Asset already booked inside requested window.", 409);
  }

  const days = Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)));
  const rentalFeeCents = days * asset.dailyRateCents;
  const depositHoldCents =
    typeof body.depositHoldCents === "number" &&
    Number.isInteger(body.depositHoldCents) &&
    body.depositHoldCents > 0
      ? body.depositHoldCents
      : Math.max(150000, Math.round(asset.replacementValueCents * 0.1));

  const newBooking: Booking = {
    id: `BK-${randomUUID().slice(0, 4).toUpperCase()}`,
    assetId: asset.id,
    customerId: customer.id,
    startDate: new Date(startMs).toISOString(),
    endDate: new Date(endMs).toISOString(),
    rentalFeeCents,
    depositHoldCents,
    authStatus: "pending",
    scheduleStatus: "tentative",
  };

  let next = await saveSession(ctx.sessionId, {
    ...ctx.data,
    bookings: [...ctx.data.bookings, newBooking],
  });
  next = await appendEventLog(
    ctx.sessionId,
    {
      actorRole: "Yard Manager",
      action: "BOOKING_CREATED",
      entityType: "booking",
      entityId: newBooking.id,
      metadata: {
        assetId: asset.id,
        customerId: customer.id,
        depositHoldCents,
      },
    },
    next
  );

  return jsonWithSession({ booking: newBooking, data: next }, ctx, 201);
}

