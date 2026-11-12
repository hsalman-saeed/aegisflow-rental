"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AppShell, type PrimaryTab } from "@/components/layout/AppShell";
import { FleetScheduler } from "@/components/scheduler/FleetScheduler";
import { AgStudioWorkspace } from "@/components/studio/AgStudioWorkspace";
import { BookingHoldPanel } from "@/components/workflow/BookingHoldPanel";
import { Channel3PricePanel } from "@/components/workflow/Channel3PricePanel";
import { ConflictResolutionPanel } from "@/components/workflow/ConflictResolutionPanel";
import { DisputeDefenseModal } from "@/components/workflow/DisputeDefenseModal";
import { PolicyGatePanel } from "@/components/workflow/PolicyGatePanel";
import { ReturnInspectionDrawer } from "@/components/workflow/ReturnInspectionDrawer";
import {
  formatUsdCents,
  type HeroStep,
  postApiJson,
} from "@/lib/ui/api-client";
import type { SessionData } from "@/types/domain";

export default function HomePage() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PrimaryTab>("cockpit");
  const [activeStep, setActiveStep] = useState<HeroStep>(1);
  const [selectedBookingId, setSelectedBookingId] = useState<string>("BK-9021");

  const fetchSession = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Session load failed with HTTP ${res.status}`);
      }
      const json = (await res.json()) as { data?: SessionData; error?: string };
      if (!json.data) {
        throw new Error(json.error ?? "Invalid session payload.");
      }
      setSession(json.data);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to initialize session."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  const handleResetSession = useCallback(async () => {
    const { ok, data: res } = await postApiJson<{
      data?: SessionData;
      error?: string;
    }>("/api/session/reset", { confirm: true });
    if (!ok || !res.data) {
      throw new Error(res.error ?? "Failed to reset session.");
    }
    setSession(res.data);
    setSelectedBookingId("BK-9021");
    setActiveStep(1);
    setActiveTab("cockpit");
  }, []);

  const completedSteps = useMemo<Record<HeroStep, boolean>>(() => {
    if (!session) {
      return { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false };
    }
    const bk9021 = session.bookings.find((b) => b.id === "BK-9021");
    const bk9024 = session.bookings.find((b) => b.id === "BK-9024");
    const insp9021 = session.inspections.find((i) => i.bookingId === "BK-9021");
    const discrepancies = (insp9021?.items ?? []).filter(
      (it) => it.type === "missing" || it.type === "damaged"
    );

    return {
      1:
        bk9021?.authStatus === "authorized" &&
        (bk9021.scheduleStatus === "dispatched" ||
          bk9021.scheduleStatus === "returned"),
      2: Boolean(insp9021?.inspectorVerified),
      3:
        discrepancies.length > 0 &&
        discrepancies.every((it) =>
          Boolean(it.channel3PriceCents && it.channel3RetailUrl)
        ),
      4:
        discrepancies.length > 0 &&
        discrepancies.every(
          (it) =>
            Boolean(it.capturedAmountCents) || it.approvalMode === "rejected"
        ),
      5:
        session.maintenanceBlocks.length > 0 &&
        bk9024?.scheduleStatus === "reassigned",
      6: session.disputes.some((d) => d.status === "Won"),
    };
  }, [session]);

  if (loading && !session) {
    return (
      <main className="min-h-screen bg-[#0B0F19] p-6 text-gray-100">
        <div className="mx-auto max-w-[1440px] space-y-4">
          <div className="h-14 animate-pulse rounded-xl border border-gray-800 bg-[#121826]" />
          <div className="h-72 animate-pulse rounded-xl border border-gray-800 bg-[#121826]" />
          <div className="h-64 animate-pulse rounded-xl border border-gray-800 bg-[#121826]" />
        </div>
      </main>
    );
  }

  if (loadError || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0F19] p-6 text-gray-100">
        <div className="max-w-md rounded-xl border border-red-500/40 bg-[#121826] p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
          <h1 className="mt-3 text-base font-semibold">
            Failed to Load AegisFlow Session
          </h1>
          <p className="mt-1 text-xs text-gray-400">
            {loadError ?? "Unknown initialization error."}
          </p>
          <button
            type="button"
            onClick={() => void fetchSession()}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry Initialization
          </button>
        </div>
      </main>
    );
  }

  const totalSettledCents = session.transactions
    .filter((t) => t.type === "partial_settlement" && t.status === "settled")
    .reduce((sum, t) => sum + t.amountCents, 0);

  return (
    <AppShell
      session={session}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      activeStep={activeStep}
      onSelectStep={setActiveStep}
      completedSteps={completedSteps}
      onResetSession={handleResetSession}
    >
      {activeTab === "cockpit" ? (
        <div className="space-y-5">
          {/* SURF-02: Bryntum Fleet Timeline */}
          <FleetScheduler
            assets={session.assets}
            bookings={session.bookings}
            customers={session.customers}
            maintenanceBlocks={session.maintenanceBlocks}
            selectedBookingId={selectedBookingId}
            onSelectBooking={(id) => setSelectedBookingId(id)}
          />

          {/* Compact 6-Table Live Telemetry Bar */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border border-gray-800 bg-[#121826] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">
                Fleet Assets
              </p>
              <p className="font-mono text-sm font-semibold text-gray-100">
                {session.assets.length}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-[#121826] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">
                Bookings
              </p>
              <p className="font-mono text-sm font-semibold text-gray-100">
                {session.bookings.length}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-[#121826] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">
                Customers
              </p>
              <p className="font-mono text-sm font-semibold text-gray-100">
                {session.customers.length}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-[#121826] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">
                Transactions
              </p>
              <p className="font-mono text-sm font-semibold text-emerald-300">
                {session.transactions.length} ({formatUsdCents(totalSettledCents)})
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-[#121826] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">
                Inspections
              </p>
              <p className="font-mono text-sm font-semibold text-gray-100">
                {session.inspections.length}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-[#121826] px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">
                Disputes
              </p>
              <p className="font-mono text-sm font-semibold text-rose-300">
                {session.disputes.length}
              </p>
            </div>
          </div>

          {/* Active Workflow Panel (SURF-03 .. SURF-08) */}
          {activeStep === 1 && (
            <BookingHoldPanel
              session={session}
              selectedBookingId={selectedBookingId}
              onSelectBooking={setSelectedBookingId}
              onSessionUpdate={setSession}
              onAdvanceStep={() => setActiveStep(2)}
            />
          )}

          {activeStep === 2 && (
            <ReturnInspectionDrawer
              session={session}
              bookingId={selectedBookingId}
              onSessionUpdate={setSession}
              onAdvanceStep={() => setActiveStep(3)}
            />
          )}

          {activeStep === 3 && (
            <Channel3PricePanel
              session={session}
              bookingId={selectedBookingId}
              onSessionUpdate={setSession}
              onAdvanceStep={() => setActiveStep(4)}
            />
          )}

          {activeStep === 4 && (
            <PolicyGatePanel
              session={session}
              bookingId={selectedBookingId}
              onSessionUpdate={setSession}
              onAdvanceStep={() => setActiveStep(5)}
            />
          )}

          {activeStep === 5 && (
            <ConflictResolutionPanel
              session={session}
              bookingId={selectedBookingId}
              onSessionUpdate={setSession}
              onAdvanceStep={() => setActiveStep(6)}
            />
          )}

          {activeStep === 6 && (
            <DisputeDefenseModal
              session={session}
              bookingId={selectedBookingId}
              onSessionUpdate={setSession}
              onOpenStudioTab={() => setActiveTab("studio")}
            />
          )}
        </div>
      ) : (
        <AgStudioWorkspace
          session={session}
          onReturnToCockpit={() => setActiveTab("cockpit")}
        />
      )}
    </AppShell>
  );
}
