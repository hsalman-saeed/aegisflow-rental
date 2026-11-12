import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  jsonError,
  jsonWithSession,
  resolveSessionContext,
} from "@/lib/api/session-http";
import { generateBackupReassignmentRationaleWithNova } from "@/lib/bedrock/client";
import {
  MAINTENANCE_DURATION_HOURS,
  createMaintenanceWindow,
  detectMaintenanceConflicts,
  findEligibleBackupAssets,
} from "@/lib/domain/conflict-engine";
import { appendEventLog, saveSession } from "@/lib/store";
import type { MaintenanceBlock } from "@/types/domain";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    assetId?: string;
    bookingId?: string;
    repairReason?: string;
    signOffIso?: string;
  };

  if (!body.assetId) {
    return jsonError("Missing assetId.", 400);
  }

  const ctx = await resolveSessionContext(req);
  const damagedAsset = ctx.data.assets.find((a) => a.id === body.assetId);
  if (!damagedAsset) {
    return jsonError(`Asset ${body.assetId} not found.`, 404);
  }

  const relatedInspection = body.bookingId
    ? ctx.data.inspections.find((i) => i.bookingId === body.bookingId)
    : ctx.data.inspections.find((i) => i.assetId === damagedAsset.id);

  const signOffIso =
    body.signOffIso ??
    relatedInspection?.signOffTimestamp ??
    "2026-11-13T14:15:00.000Z";
  const window = createMaintenanceWindow(signOffIso, MAINTENANCE_DURATION_HOURS);

  const block: MaintenanceBlock = {
    id: `maint_${randomUUID().slice(0, 6)}`,
    assetId: damagedAsset.id,
    reason:
      body.repairReason?.trim() ||
      "48h Diagnostic & Audio/Optics Bench Calibration after Return Damage",
    startDate: window.startDate,
    endDate: window.endDate,
    createdAt: new Date().toISOString(),
  };

  const nextAssets = ctx.data.assets.map((a) =>
    a.id === damagedAsset.id ? { ...a, status: "maintenance" as const } : a
  );
  const conflicts = detectMaintenanceConflicts(
    damagedAsset.id,
    window,
    ctx.data.bookings
  );

  const recommendations = await Promise.all(
    conflicts.map(async (conflict) => {
      const eligibleBackups = findEligibleBackupAssets(
        conflict,
        nextAssets,
        ctx.data.bookings,
        damagedAsset.id
      );
      const aiChoice = await generateBackupReassignmentRationaleWithNova({
        damagedAsset,
        conflictingBooking: conflict,
        eligibleBackups,
      });
      return {
        conflictingBookingId: conflict.id,
        eligibleBackups,
        recommendedAssetId: aiChoice.recommendedAssetId,
        rationale: aiChoice.rationale,
        modelUsed: aiChoice.modelUsed,
        aiSource: aiChoice.aiSource,
        aiAvailable: aiChoice.aiAvailable,
      };
    })
  );

  const conflictedIds = new Set(
    recommendations
      .filter((r) => r.eligibleBackups.length === 0)
      .map((r) => r.conflictingBookingId)
  );
  const nextBookings = ctx.data.bookings.map((b) =>
    conflictedIds.has(b.id) ? { ...b, scheduleStatus: "at_risk" as const } : b
  );

  let next = await saveSession(ctx.sessionId, {
    ...ctx.data,
    assets: nextAssets,
    bookings: nextBookings,
    maintenanceBlocks: [...ctx.data.maintenanceBlocks, block],
  });
  next = await appendEventLog(
    ctx.sessionId,
    {
      actorRole: "System / AI",
      action: "MAINTENANCE_CONFLICT_SCANNED",
      entityType: "booking",
      entityId: damagedAsset.id,
      metadata: {
        maintenanceBlockId: block.id,
        conflictsFound: conflicts.length,
        window,
      },
    },
    next
  );

  return jsonWithSession(
    { maintenanceBlock: block, conflicts, recommendations, data: next },
    ctx
  );
}

