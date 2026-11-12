"use client";

import "@bryntum/scheduler/scheduler.css";
import "@bryntum/scheduler/stockholm-dark.css";
import { useMemo } from "react";
import { BryntumScheduler } from "@bryntum/scheduler-react";
import type { Asset, Booking, Customer, MaintenanceBlock } from "@/types/domain";

export interface TimelineEventItem {
  id: string;
  resourceId: string;
  name: string;
  startDate: string;
  endDate: string;
  cls: string;
  bookingId?: string;
}

interface BryntumTimelineInnerProps {
  assets: Asset[];
  bookings: Booking[];
  customers: Customer[];
  maintenanceBlocks: MaintenanceBlock[];
  selectedBookingId: string;
  viewPreset: string;
  onSelectBooking: (bookingId: string) => void;
}

function getBookingVisualState(booking: Booking): {
  cls: string;
  badge: string;
} {
  if (booking.authStatus === "declined") {
    return {
      cls: "af-ev-hold-failed",
      badge: "[⚠ HOLD FAILED — DISPATCH BLOCKED]",
    };
  }
  switch (booking.scheduleStatus) {
    case "reassigned":
      return {
        cls: "af-ev-reassigned",
        badge: "[⇄ REASSIGNED TO BACKUP UNIT]",
      };
    case "at_risk":
      return {
        cls: "af-ev-at-risk",
        badge: "[🚨 AT RISK — CONFLICT]",
      };
    case "dispatched":
      return {
        cls: "af-ev-dispatched",
        badge: "[🎬 DISPATCHED / IN FIELD]",
      };
    case "returned":
    case "closed":
      return {
        cls: "af-ev-returned",
        badge: "[📦 RETURN CHECK-IN]",
      };
    case "confirmed":
      return {
        cls: "af-ev-confirmed",
        badge: "[✓ CONFIRMED — DEPOSIT HELD]",
      };
    default:
      return {
        cls: "af-ev-tentative",
        badge: "[⏳ TENTATIVE — AWAITING HOLD]",
      };
  }
}

export default function BryntumTimelineInner({
  assets,
  bookings,
  customers,
  maintenanceBlocks,
  selectedBookingId,
  viewPreset,
  onSelectBooking,
}: BryntumTimelineInnerProps) {
  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers]
  );

  const resources = useMemo(
    () =>
      assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        category: asset.category,
        serialNumber: asset.serialNumber,
        status: asset.status,
      })),
    [assets]
  );

  const events = useMemo<TimelineEventItem[]>(() => {
    const bookingEvents: TimelineEventItem[] = bookings.map((b) => {
      const cust = customerMap.get(b.customerId);
      const vis = getBookingVisualState(b);
      const selectedCls =
        b.id === selectedBookingId ? " ring-2 ring-sky-400" : "";

      return {
        id: `ev_${b.id}`,
        resourceId: b.assetId,
        name: `${vis.badge} ${b.id} · ${cust?.name ?? b.customerId}`,
        startDate: b.startDate,
        endDate: b.endDate,
        cls: `${vis.cls}${selectedCls}`,
        bookingId: b.id,
      };
    });

    const maintEvents: TimelineEventItem[] = maintenanceBlocks.map((m) => ({
      id: `ev_${m.id}`,
      resourceId: m.assetId,
      name: `[🔧 48H MAINTENANCE BLOCK] ${m.reason}`,
      startDate: m.startDate,
      endDate: m.endDate,
      cls: "af-ev-maintenance",
    }));

    return [...bookingEvents, ...maintEvents];
  }, [bookings, customerMap, maintenanceBlocks, selectedBookingId]);

  const columns = useMemo(
    () => [
      {
        text: "Fleet Asset & Status",
        field: "name",
        width: 245,
      },
      {
        text: "Serial",
        field: "serialNumber",
        width: 95,
      },
    ],
    []
  );

  return (
    <div className="af-bryntum-host overflow-hidden rounded-lg border border-gray-800">
      <BryntumScheduler
        height={310}
        rowHeight={54}
        barMargin={8}
        startDate="2026-11-11T00:00:00Z"
        endDate="2026-11-18T00:00:00Z"
        viewPreset={viewPreset}
        forceFit={viewPreset !== "hourAndDay"}
        readOnly={true}
        eventDragFeature={{ disabled: true }}
        eventResizeFeature={{ disabled: true }}
        eventDragCreateFeature={{ disabled: true }}
        columns={columns}
        resources={resources}
        events={events}
        eventRenderer={({ eventRecord }) => {
          const text = String(eventRecord.getData("name") ?? "");
          return text;
        }}
        onEventClick={({ eventRecord }) => {
          const bId = eventRecord.getData("bookingId") as string | undefined;
          if (bId) {
            onSelectBooking(bId);
          }
        }}
      />
    </div>
  );
}

