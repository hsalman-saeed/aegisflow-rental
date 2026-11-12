import { NextRequest } from "next/server";
import {
  jsonError,
  jsonWithSession,
  resolveSessionContext,
} from "@/lib/api/session-http";
import { appendEventLog, saveSession } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { bookingId?: string };
  if (!body.bookingId) {
    return jsonError("Missing bookingId.", 400);
  }

  const ctx = await resolveSessionContext(req);
  const booking = ctx.data.bookings.find((b) => b.id === body.bookingId);
  if (!booking) {
    return jsonError(`Booking ${body.bookingId} not found.`, 404);
  }

  // BR-030 / AC-013-1: Cannot dispatch unless deposit auth hold is authorized
  if (booking.authStatus !== "authorized") {
    return jsonError(
      `Dispatch blocked: booking ${booking.id} authStatus is "${booking.authStatus}", expected "authorized".`,
      400,
      { authStatus: booking.authStatus }
    );
  }

  const updatedBookings = ctx.data.bookings.map((b) =>
    b.id === booking.id ? { ...b, scheduleStatus: "dispatched" as const } : b
  );
  const updatedAssets = ctx.data.assets.map((a) =>
    a.id === booking.assetId ? { ...a, status: "rented" as const } : a
  );

  let next = await saveSession(ctx.sessionId, {
    ...ctx.data,
    bookings: updatedBookings,
    assets: updatedAssets,
  });
  next = await appendEventLog(
    ctx.sessionId,
    {
      actorRole: "Yard Manager",
      action: "BOOKING_DISPATCHED",
      entityType: "booking",
      entityId: booking.id,
      metadata: { assetId: booking.assetId },
    },
    next
  );

  const updatedBooking = next.bookings.find((b) => b.id === booking.id)!;
  return jsonWithSession(
    { scheduleStatus: updatedBooking.scheduleStatus, booking: updatedBooking, data: next },
    ctx
  );
}

