import { NextRequest } from "next/server";
import {
  jsonError,
  jsonWithSession,
  resolveSessionContext,
} from "@/lib/api/session-http";
import { appendEventLog, saveSession } from "@/lib/store";
import type { InspectionItem } from "@/types/domain";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    bookingId?: string;
    confirmedItems?: Array<{
      id: string;
      type: InspectionItem["type"];
      evidenceNotes?: string;
      needsMaintenance?: boolean;
    }>;
  };

  if (!body.bookingId) {
    return jsonError("Missing bookingId.", 400);
  }

  const ctx = await resolveSessionContext(req);
  const booking = ctx.data.bookings.find((b) => b.id === body.bookingId);
  const inspection = ctx.data.inspections.find((i) => i.bookingId === body.bookingId);
  if (!booking || !inspection) {
    return jsonError(`Inspection for booking ${body.bookingId} not found.`, 404);
  }

  const confirmedMap = new Map(
    (body.confirmedItems ?? []).map((item) => [item.id, item])
  );

  // Anchor signOffTimestamp cleanly so an early demo return on BK-9021 still
  // places the 48h maintenance window right after booking.endDate (Nov 13 14:15Z).
  const bookingEndPlusBuffer = Date.parse(booking.endDate) + 15 * 60 * 1000;
  const signOffTimestamp = new Date(
    Math.max(Date.now(), Number.isFinite(bookingEndPlusBuffer) ? bookingEndPlusBuffer : Date.now())
  ).toISOString();

  const updatedInspection = {
    ...inspection,
    inspectorVerified: true,
    signOffTimestamp,
    items: inspection.items.map((item) => {
      const override = confirmedMap.get(item.id);
      const nextType = override?.type ?? item.type;
      return {
        ...item,
        type: nextType,
        evidenceNotes: override?.evidenceNotes ?? item.evidenceNotes,
        needsMaintenance: override?.needsMaintenance ?? item.needsMaintenance,
        inspectorVerified: true,
      };
    }),
  };

  const nextBookings = ctx.data.bookings.map((b) =>
    b.id === booking.id ? { ...b, scheduleStatus: "returned" as const } : b
  );

  let next = await saveSession(ctx.sessionId, {
    ...ctx.data,
    bookings: nextBookings,
    inspections: ctx.data.inspections.map((i) =>
      i.id === updatedInspection.id ? updatedInspection : i
    ),
  });
  next = await appendEventLog(
    ctx.sessionId,
    {
      actorRole: "Yard Manager",
      action: "INSPECTION_CONFIRMED",
      entityType: "inspection",
      entityId: updatedInspection.id,
      metadata: {
        bookingId: booking.id,
        signOffTimestamp,
        discrepancyCount: updatedInspection.items.filter((i) => i.type !== "ok").length,
      },
    },
    next
  );

  return jsonWithSession({ inspection: updatedInspection, data: next }, ctx);
}

