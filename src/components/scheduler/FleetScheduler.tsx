"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { CalendarDays, ZoomIn, ZoomOut } from "lucide-react";
import type { Asset, Booking, Customer, MaintenanceBlock } from "@/types/domain";

const BryntumTimelineInner = dynamic(() => import("./BryntumTimelineInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[310px] items-center justify-center rounded-lg border border-gray-800 bg-[#111827] text-xs text-gray-400">
      Initializing Bryntum Fleet Scheduler Canvas...
    </div>
  ),
});

type CategoryFilter = "All" | Asset["category"];

interface FleetSchedulerProps {
  assets: Asset[];
  bookings: Booking[];
  customers: Customer[];
  maintenanceBlocks: MaintenanceBlock[];
  selectedBookingId: string;
  onSelectBooking: (bookingId: string) => void;
}

const CATEGORIES: CategoryFilter[] = [
  "All",
  "Cinema Cameras",
  "Lighting",
  "Audio",
];

const ZOOM_PRESETS = ["hourAndDay", "dayAndWeek", "weekAndDay"] as const;

export function FleetScheduler({
  assets,
  bookings,
  customers,
  maintenanceBlocks,
  selectedBookingId,
  onSelectBooking,
}: FleetSchedulerProps) {
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [presetIndex, setPresetIndex] = useState(1);

  const filteredAssets = useMemo(
    () =>
      category === "All"
        ? assets
        : assets.filter((a) => a.category === category),
    [assets, category]
  );

  const visibleAssetIds = useMemo(
    () => new Set(filteredAssets.map((a) => a.id)),
    [filteredAssets]
  );

  const filteredBookings = useMemo(
    () => bookings.filter((b) => visibleAssetIds.has(b.assetId)),
    [bookings, visibleAssetIds]
  );

  const filteredMaintenance = useMemo(
    () => maintenanceBlocks.filter((m) => visibleAssetIds.has(m.assetId)),
    [maintenanceBlocks, visibleAssetIds]
  );

  return (
    <section
      aria-label="Fleet Availability and Deposit Status Timeline"
      className="rounded-xl border border-gray-800 bg-[#111827] p-4 shadow-lg"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-white">
            Live Fleet Schedule &amp; Dispatch Timeline (Nov 11 – Nov 17, 2026)
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filter assets by category" className="flex gap-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                  category === cat
                    ? "bg-blue-600 text-white"
                    : "border border-gray-700 bg-[#090D16] text-gray-300 hover:bg-gray-800"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 border-l border-gray-800 pl-2">
            <button
              type="button"
              onClick={() => setPresetIndex(1)}
              className={`rounded border px-2 py-1 text-[11px] font-medium transition ${
                presetIndex >= 1
                  ? "border-blue-500/60 bg-blue-600/20 text-blue-200"
                  : "border-gray-700 bg-[#090D16] text-gray-300 hover:bg-gray-800"
              }`}
            >
              Week View (All 7 Days)
            </button>
            <button
              type="button"
              onClick={() => setPresetIndex(0)}
              className={`rounded border px-2 py-1 text-[11px] font-medium transition ${
                presetIndex === 0
                  ? "border-blue-500/60 bg-blue-600/20 text-blue-200"
                  : "border-gray-700 bg-[#090D16] text-gray-300 hover:bg-gray-800"
              }`}
            >
              Detailed Day/Hour View
            </button>
            <button
              type="button"
              onClick={() => setPresetIndex((i) => Math.max(0, i - 1))}
              disabled={presetIndex === 0}
              aria-label="Zoom In Timeline"
              className="rounded border border-gray-700 bg-[#090D16] p-1 text-gray-300 hover:bg-gray-800 disabled:opacity-40"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                setPresetIndex((i) => Math.min(ZOOM_PRESETS.length - 1, i + 1))
              }
              disabled={presetIndex === ZOOM_PRESETS.length - 1}
              aria-label="Zoom Out Timeline"
              className="rounded border border-gray-700 bg-[#090D16] p-1 text-gray-300 hover:bg-gray-800 disabled:opacity-40"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <BryntumTimelineInner
        assets={filteredAssets}
        bookings={filteredBookings}
        customers={customers}
        maintenanceBlocks={filteredMaintenance}
        selectedBookingId={selectedBookingId}
        viewPreset={ZOOM_PRESETS[presetIndex]!}
        onSelectBooking={onSelectBooking}
      />

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
        <div className="flex flex-wrap gap-3">
          <span>[✓ CONFIRMED] Held</span>
          <span>[⏳ TENTATIVE] Unheld</span>
          <span>[⚠ HOLD FAILED] Blocked</span>
          <span>[🔧 48H MAINT] Repair</span>
          <span>[⇄ REASSIGNED] Swapped</span>
        </div>
        <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
          Timeline Lock Active: All schedule mutations are gated by server-side PayPal Braintree Deposit Holds &amp; Conflict Engine.
        </span>
        <span>
          Powered by Bryntum Scheduler (Hackathon Evaluation License) &middot; Server-Side Deposit Hold &amp; Maintenance Locks Active
        </span>
      </div>
    </section>
  );
}

