import type { Asset, Booking } from "@/types/domain";

/** Default turnaround buffer when major equipment returns damaged (DEC-PRD-05). */
export const MAINTENANCE_DURATION_HOURS = 48;

const ACTIVE_BOOKING_STATUSES = new Set<Booking["scheduleStatus"]>([
  "tentative",
  "confirmed",
  "dispatched",
  "reassigned",
  "at_risk",
]);

/** Evaluates overlap between two half-open UTC intervals [start, end). */
export function intervalsOverlap(
  aStartIso: string,
  aEndIso: string,
  bStartIso: string,
  bEndIso: string
): boolean {
  const aStart = Date.parse(aStartIso);
  const aEnd = Date.parse(aEndIso);
  const bStart = Date.parse(bStartIso);
  const bEnd = Date.parse(bEndIso);

  if (
    !Number.isFinite(aStart) ||
    !Number.isFinite(aEnd) ||
    !Number.isFinite(bStart) ||
    !Number.isFinite(bEnd)
  ) {
    throw new RangeError("Invalid ISO 8601 timestamp in interval overlap check.");
  }

  return aStart < bEnd && bStart < aEnd;
}

/** Computes an ISO 8601 maintenance window starting from inspection sign-off. */
export function createMaintenanceWindow(
  signOffIso: string,
  hours = MAINTENANCE_DURATION_HOURS
): { startDate: string; endDate: string } {
  const startMs = Date.parse(signOffIso);
  if (!Number.isFinite(startMs)) {
    throw new RangeError(`Invalid sign-off timestamp: ${signOffIso}`);
  }
  const endMs = startMs + hours * 60 * 60 * 1000;
  return {
    startDate: new Date(startMs).toISOString(),
    endDate: new Date(endMs).toISOString(),
  };
}

/** Finds all active bookings on the damaged unit overlapping the maintenance window. */
export function detectMaintenanceConflicts(
  damagedAssetId: string,
  maintenanceWindow: { startDate: string; endDate: string },
  bookings: Booking[]
): Booking[] {
  return bookings.filter(
    (booking) =>
      booking.assetId === damagedAssetId &&
      ACTIVE_BOOKING_STATUSES.has(booking.scheduleStatus) &&
      intervalsOverlap(
        booking.startDate,
        booking.endDate,
        maintenanceWindow.startDate,
        maintenanceWindow.endDate
      )
  );
}

/**
 * Returns deterministic eligible backup units capable of fulfilling a colliding
 * booking with zero schedule overlaps, sorted ascending by asset ID (BR-022).
 */
export function findEligibleBackupAssets(
  conflictingBooking: Booking,
  assets: Asset[],
  allBookings: Booking[],
  damagedAssetId: string
): Asset[] {
  const damagedAsset = assets.find((asset) => asset.id === damagedAssetId);

  return assets
    .filter((candidate) => {
      if (candidate.id === damagedAssetId) return false;
      if (candidate.status !== "available") return false;

      if (
        damagedAsset &&
        candidate.model !== damagedAsset.model &&
        candidate.category !== damagedAsset.category
      ) {
        return false;
      }

      const hasOverlap = allBookings.some(
        (existing) =>
          existing.id !== conflictingBooking.id &&
          existing.assetId === candidate.id &&
          ACTIVE_BOOKING_STATUSES.has(existing.scheduleStatus) &&
          intervalsOverlap(
            existing.startDate,
            existing.endDate,
            conflictingBooking.startDate,
            conflictingBooking.endDate
          )
      );

      return !hasOverlap;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Rejects AI-hallucinated asset IDs outside eligible backups and offers fallback. */
export function validateBackupSelection(
  proposedAssetId: string,
  eligibleBackups: Asset[]
): {
  valid: boolean;
  selectedAsset: Asset | null;
  fallbackRuleAsset: Asset | null;
} {
  const matched =
    eligibleBackups.find((asset) => asset.id === proposedAssetId) ?? null;
  const fallbackRuleAsset = eligibleBackups[0] ?? null;

  return {
    valid: matched !== null,
    selectedAsset: matched,
    fallbackRuleAsset,
  };
}

