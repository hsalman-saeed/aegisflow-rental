import { NextRequest } from "next/server";
import {
  jsonError,
  jsonWithSession,
  resolveSessionContext,
} from "@/lib/api/session-http";
import {
  findEligibleBackupAssets,
  validateBackupSelection,
} from "@/lib/domain/conflict-engine";
import { appendEventLog, saveSession } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    bookingId?: string;
    targetAssetId?: string;
  };

  if (!body.bookingId || !body.targetAssetId) {
    return jsonError("Missing bookingId or targetAssetId.", 400);
  }

  const ctx = await resolveSessionContext(req);
  const booking = ctx.data.bookings.find((b) => b.id === body.bookingId);
  if (!booking) {
    return jsonError(`Booking ${body.bookingId} not found.`, 404);
  }

  const eligibleBackups = findEligibleBackupAssets(
    booking,
    ctx.data.assets,
    ctx.data.bookings,
    booking.assetId
  );
  const validation = validateBackupSelection(body.targetAssetId, eligibleBackups);

  if (!validation.valid || !validation.selectedAsset) {
    return jsonError(
      `Target asset ${body.targetAssetId} is not an eligible conflict-free backup unit.`,
      409,
      { eligibleAssetIds: eligibleBackups.map((a) => a.id) }
    );
  }

  const previousAssetId = booking.assetId;
  const nextBookings = ctx.data.bookings.map((b) =>
    b.id === booking.id
      ? {
          ...b,
          assetId: validation.selectedAsset!.id,
          scheduleStatus: "reassigned" as const,
        }
      : b
  );

  let next = await saveSession(ctx.sessionId, {
    ...ctx.data,
    bookings: nextBookings,
  });
  next = await appendEventLog(
    ctx.sessionId,
    {
      actorRole: "Yard Manager",
      action: "BOOKING_REASSIGNED",
      entityType: "booking",
      entityId: booking.id,
      metadata: {
        previousAssetId,
        targetAssetId: validation.selectedAsset.id,
      },
    },
    next
  );

  const updatedBooking = next.bookings.find((b) => b.id === booking.id)!;
  return jsonWithSession({ booking: updatedBooking, data: next }, ctx);
}

