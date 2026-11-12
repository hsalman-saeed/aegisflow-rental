"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Cpu,
  ShieldAlert,
  Sparkles,
  Wrench,
} from "lucide-react";
import { postApiJson } from "@/lib/ui/api-client";
import type { Asset, Booking, MaintenanceBlock, SessionData } from "@/types/domain";

interface ConflictRecommendation {
  conflictingBookingId: string;
  eligibleBackups: Asset[];
  recommendedAssetId: string | null;
  rationale: string;
  modelUsed: string;
  aiSource: "amazon-nova-pro" | "amazon-nova-lite" | "deterministic-fallback";
  aiAvailable: boolean;
}

interface MaintenanceConflictResponse {
  maintenanceBlock: MaintenanceBlock;
  conflicts: Booking[];
  recommendations: ConflictRecommendation[];
  data: SessionData;
}

interface ReassignResponse {
  booking: Booking;
  data: SessionData;
}

interface ConflictResolutionPanelProps {
  session: SessionData;
  bookingId: string;
  onSessionUpdate: (data: SessionData) => void;
  onAdvanceStep: () => void;
}

export function ConflictResolutionPanel({
  session,
  bookingId,
  onSessionUpdate,
  onAdvanceStep,
}: ConflictResolutionPanelProps) {
  const [repairReason, setRepairReason] = useState(
    "48h Acoustic & Audio Port Inspection (Post-Return Discrepancy)"
  );
  const [scanning, setScanning] = useState(false);
  const [reassigningId, setReassigningId] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<
    ConflictRecommendation[]
  >([]);
  const [selectedTargets, setSelectedTargets] = useState<Record<string, string>>(
    {}
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const booking =
    session.bookings.find((b) => b.id === bookingId) ?? session.bookings[0];
  const asset = session.assets.find((a) => a.id === booking?.assetId);
  const inspection =
    session.inspections.find((i) => i.bookingId === booking?.id) ??
    session.inspections[0];

  const activeBlocks = session.maintenanceBlocks.filter(
    (m) => m.assetId === booking?.assetId
  );

  // Detect colliding bookings from current session if recommendations weren't cached yet
  const atRiskOrCollidingBookings = session.bookings.filter((b) => {
    if (b.id === booking?.id) return false;
    if (b.scheduleStatus === "at_risk") return true;
    if (activeBlocks.length > 0 && b.assetId === booking?.assetId) {
      return activeBlocks.some(
        (blk) =>
          !(b.endDate <= blk.startDate || b.startDate >= blk.endDate) &&
          b.scheduleStatus !== "reassigned" &&
          b.scheduleStatus !== "closed"
      );
    }
    return false;
  });

  const reassignedBookings = session.bookings.filter(
    (b) => b.scheduleStatus === "reassigned"
  );

  const hasMaintenanceBlock = activeBlocks.length > 0;
  const allConflictsResolved =
    hasMaintenanceBlock &&
    atRiskOrCollidingBookings.length === 0 &&
    (reassignedBookings.length > 0 || recommendations.length > 0);

  const handleScanConflicts = async () => {
    if (!booking) return;
    setErrorMsg(null);
    setStatusNotice(null);
    setScanning(true);
    try {
      const { ok, data: res } = await postApiJson<
        MaintenanceConflictResponse & { error?: string }
      >("/api/scheduler/maintenance-and-conflict", {
        assetId: booking.assetId,
        bookingId: booking.id,
        repairReason: repairReason.trim() || undefined,
        signOffIso: inspection?.signOffTimestamp,
      });
      if (!ok || !res.data) {
        setErrorMsg(
          res.error ?? "Failed to insert maintenance block and scan conflicts."
        );
        return;
      }
      onSessionUpdate(res.data);
      setRecommendations(res.recommendations);

      const defaults: Record<string, string> = {};
      for (const rec of res.recommendations) {
        if (rec.recommendedAssetId) {
          defaults[rec.conflictingBookingId] = rec.recommendedAssetId;
        } else if (rec.eligibleBackups[0]?.id) {
          defaults[rec.conflictingBookingId] = rec.eligibleBackups[0].id;
        }
      }
      setSelectedTargets((prev) => ({ ...prev, ...defaults }));

      setStatusNotice(
        res.conflicts.length > 0
          ? `Inserted 48h maintenance window (${res.maintenanceBlock.startDate.slice(0, 10)} → ${res.maintenanceBlock.endDate.slice(0, 10)}) and flagged ${res.conflicts.length} downstream booking conflict(s).`
          : `Inserted 48h maintenance window on ${asset?.name ?? booking.assetId}. Zero overlapping downstream bookings found.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to insert maintenance block and scan conflicts."
      );
    } finally {
      setScanning(false);
    }
  };

  const handleReassign = async (
    conflictingBookingId: string,
    targetAssetId: string
  ) => {
    setErrorMsg(null);
    setStatusNotice(null);
    setReassigningId(conflictingBookingId);
    try {
      const { ok, data: res } = await postApiJson<
        ReassignResponse & { error?: string }
      >("/api/scheduler/reassign", {
        bookingId: conflictingBookingId,
        targetAssetId,
      });
      if (!ok || !res.data) {
        setErrorMsg(res.error ?? "Failed to reassign booking.");
        return;
      }
      onSessionUpdate(res.data);
      const targetAsset = res.data.assets.find((a) => a.id === targetAssetId);
      setStatusNotice(
        `Reassigned ${conflictingBookingId} to ${targetAsset?.name ?? targetAssetId}. Bryntum Fleet Timeline updated immediately.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to reassign booking."
      );
    } finally {
      setReassigningId(null);
    }
  };

  const formatCustomerLabel = (customerId: string) => {
    const c = session.customers.find((cust) => cust.id === customerId);
    return c ? `${c.name} (${c.company})` : customerId;
  };

  return (
    <section
      aria-labelledby="conflict-resolution-heading"
      className="rounded-xl border border-gray-800 bg-[#121826] p-5"
    >
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-300">
              5
            </span>
            <h2
              id="conflict-resolution-heading"
              className="text-base font-semibold text-gray-100"
            >
              48h Maintenance Block &amp; Fleet Conflict Resolution
            </h2>
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              Bryntum Auto-Conflict
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Quarantine{" "}
            <span className="font-medium text-gray-200">
              {asset ? `${asset.name} (SN: ${asset.serialNumber})` : booking?.assetId}
            </span>{" "}
            for 48 hours after discrepancy sign-off, detect colliding future
            bookings, and move affected shoots to an eligible backup unit.
          </p>
        </div>

        <span className="rounded-lg border border-gray-800 bg-[#0B0F19] px-3 py-1.5 text-[11px] text-gray-300">
          Primary Asset:{" "}
          <span className="font-semibold text-amber-300">
            {asset ? `${asset.name} (SN: ${asset.serialNumber})` : booking?.assetId}
          </span>
        </span>
      </div>

      {/* Maintenance Trigger Controls */}
      <div className="mb-4 rounded-xl border border-gray-800 bg-[#0B0F19] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label
              htmlFor="af-repair-reason"
              className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400"
            >
              Maintenance Quarantine Reason
            </label>
            <input
              id="af-repair-reason"
              type="text"
              value={repairReason}
              onChange={(e) => setRepairReason(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-[#121826] px-3 py-2 text-xs text-gray-100 focus:border-amber-400 focus:outline-none"
            />
          </div>
          <button
            type="button"
            disabled={scanning || !booking}
            onClick={handleScanConflicts}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Wrench className="h-3.5 w-3.5" />
            {scanning
              ? "Scanning Fleet & Querying Nova..."
              : "Insert 48h Maintenance Block & Scan Fleet Conflicts"}
          </button>
        </div>

        {activeBlocks.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-gray-800 pt-3">
            {activeBlocks.map((blk) => (
              <div
                key={blk.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
              >
                <span className="inline-flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-amber-400" />
                  <strong>48h Maintenance Quarantine:</strong>{" "}
                  {blk.reason}
                </span>
                <span className="font-mono text-[11px] text-amber-300">
                  {blk.startDate.slice(0, 16).replace("T", " ")} →{" "}
                  {blk.endDate.slice(0, 16).replace("T", " ")} UTC
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {statusNotice && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Colliding Bookings & Recommendations */}
      {recommendations.length > 0 ? (
        <div className="space-y-4">
          {recommendations.map((rec) => {
            const conflictingBooking = session.bookings.find(
              (b) => b.id === rec.conflictingBookingId
            );
            const isAlreadyReassigned =
              conflictingBooking?.scheduleStatus === "reassigned";
            const chosenAssetId =
              selectedTargets[rec.conflictingBookingId] ??
              rec.recommendedAssetId ??
              rec.eligibleBackups[0]?.id ??
              "";
            const reassignedAsset = session.assets.find(
              (a) => a.id === conflictingBooking?.assetId
            );

            return (
              <div
                key={rec.conflictingBookingId}
                className={`rounded-xl border p-4 ${
                  isAlreadyReassigned
                    ? "border-emerald-500/40 bg-emerald-950/15"
                    : rec.eligibleBackups.length === 0
                      ? "border-red-500/50 bg-red-950/15"
                      : "border-rose-500/40 bg-[#0B0F19]"
                }`}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert
                      className={`h-4 w-4 ${
                        isAlreadyReassigned
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    />
                    <span className="font-mono text-xs font-bold text-gray-100">
                      {rec.conflictingBookingId}
                    </span>
                    <span className="text-xs text-gray-300">
                      {conflictingBooking
                        ? formatCustomerLabel(conflictingBooking.customerId)
                        : ""}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        isAlreadyReassigned
                          ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                          : "border border-rose-500/40 bg-rose-500/15 text-rose-200"
                      }`}
                    >
                      {conflictingBooking?.scheduleStatus ?? "at_risk"}
                    </span>
                  </div>

                  {/* AI vs Deterministic Honesty Badge */}
                  {rec.aiAvailable ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/15 px-2.5 py-0.5 text-[11px] font-medium text-violet-200">
                      <Sparkles className="h-3 w-3 text-violet-300" />
                      AI Rationale ({rec.modelUsed})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-200">
                      <Cpu className="h-3 w-3 text-amber-300" />
                      Deterministic Fleet Match Fallback — Amazon Nova unavailable
                    </span>
                  )}
                </div>

                {conflictingBooking && (
                  <p className="mb-2 text-xs text-gray-400">
                    Window:{" "}
                    <span className="font-mono text-gray-200">
                      {conflictingBooking.startDate.slice(0, 10)} →{" "}
                      {conflictingBooking.endDate.slice(0, 10)}
                    </span>
                  </p>
                )}

                <p className="mb-3 rounded-lg border border-gray-800 bg-[#121826] p-3 text-xs leading-relaxed text-gray-300">
                  {rec.rationale}
                </p>

                {isAlreadyReassigned ? (
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Reassigned cleanly to{" "}
                    <span className="font-semibold text-white">
                      {reassignedAsset?.name ?? conflictingBooking?.assetId}
                    </span>
                    . Zero schedule collisions remain.
                  </div>
                ) : rec.eligibleBackups.length === 0 ? (
                  <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                    <strong>No eligible backup units available</strong> for this
                    shoot window. Booking remains marked{" "}
                    <span className="font-mono font-semibold">at_risk</span> for
                    manual sub-rental outreach.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                    <div className="flex-1">
                      <label className="mb-1 block text-[11px] text-gray-400">
                        Select Eligible Backup Asset:
                      </label>
                      <select
                        value={chosenAssetId}
                        onChange={(e) =>
                          setSelectedTargets((prev) => ({
                            ...prev,
                            [rec.conflictingBookingId]: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-700 bg-[#121826] px-3 py-2 text-xs text-gray-100 focus:border-violet-400 focus:outline-none"
                      >
                        {rec.eligibleBackups.map((bk) => (
                          <option key={bk.id} value={bk.id}>
                            {bk.name} (SN: {bk.serialNumber}
                            {bk.id === rec.recommendedAssetId
                              ? " — Recommended"
                              : ""}
                            )
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={
                        !chosenAssetId ||
                        reassigningId === rec.conflictingBookingId
                      }
                      onClick={() =>
                        handleReassign(rec.conflictingBookingId, chosenAssetId)
                      }
                      className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {reassigningId === rec.conflictingBookingId
                        ? "Reassigning..."
                        : "Reassign Booking to Backup Unit & Confirm"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : atRiskOrCollidingBookings.length > 0 ? (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-200">
          {atRiskOrCollidingBookings.length} booking(s) currently collide with
          the maintenance block ({atRiskOrCollidingBookings.map((b) => b.id).join(", ")}
          ). Click{" "}
          <strong>Insert 48h Maintenance Block &amp; Scan Fleet Conflicts</strong>{" "}
          above to load eligible backup recommendations.
        </div>
      ) : reassignedBookings.length > 0 ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-emerald-200">
          <CheckCircle2 className="mr-1.5 inline h-4 w-4 text-emerald-400" />
          Downstream booking{" "}
          <span className="font-mono font-semibold">
            {reassignedBookings.map((b) => b.id).join(", ")}
          </span>{" "}
          reassigned to backup equipment cleanly.
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-700 bg-[#0B0F19] p-5 text-center text-xs text-gray-400">
          Click{" "}
          <span className="font-semibold text-gray-200">
            Insert 48h Maintenance Block &amp; Scan Fleet Conflicts
          </span>{" "}
          to quarantine {asset?.name ?? booking?.assetId} and evaluate backup
          reassignment options.
        </div>
      )}

      {/* Next Step Footer */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 pt-4">
        <p className="text-xs text-gray-400">
          {allConflictsResolved
            ? "Fleet conflict resolved cleanly. Advance to Step 6 for chargeback dispute defense."
            : "Insert the 48h maintenance block and resolve any colliding booking above."}
        </p>
        <button
          type="button"
          onClick={onAdvanceStep}
          disabled={!allConflictsResolved}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Step 6: Chargeback Dispute Defense
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}
