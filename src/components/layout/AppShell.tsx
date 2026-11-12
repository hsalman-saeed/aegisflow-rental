"use client";

import { useState, type ReactNode } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clapperboard,
  Lock,
  RotateCcw,
  ScrollText,
} from "lucide-react";
import { AuditLogDrawer } from "@/components/layout/AuditLogDrawer";
import { ComplianceBanner } from "@/components/layout/ComplianceBanner";
import { DiscordProofModal } from "@/components/layout/DiscordProofModal";
import { SessionResetModal } from "@/components/layout/SessionResetModal";
import type { HeroStep } from "@/lib/ui/api-client";
import type { SessionData } from "@/types/domain";

export type PrimaryTab = "cockpit" | "studio";

interface AppShellProps {
  session: SessionData;
  activeTab: PrimaryTab;
  onSelectTab: (tab: PrimaryTab) => void;
  activeStep: HeroStep;
  onSelectStep: (step: HeroStep) => void;
  completedSteps: Record<HeroStep, boolean>;
  onResetSession: () => Promise<void>;
  children: ReactNode;
}

const STEP_LABELS: Array<{ step: HeroStep; short: string }> = [
  { step: 1, short: "Step 1: Hold & Lock" },
  { step: 2, short: "Step 2: Multimodal Inspect" },
  { step: 3, short: "Step 3: Channel3 Price Proof" },
  { step: 4, short: "Step 4: $100 Policy Gate & Capture" },
  { step: 5, short: "Step 5: 48h Maintenance & Reassign" },
  { step: 6, short: "Step 6: Dispute Defense & Studio BI" },
];

export function AppShell({
  session,
  activeTab,
  onSelectTab,
  activeStep,
  onSelectStep,
  completedSteps,
  onResetSession,
  children,
}: AppShellProps) {
  const [proofOpen, setProofOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const handleConfirmReset = async () => {
    setResetBusy(true);
    try {
      await onResetSession();
      setResetOpen(false);
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090D16] text-gray-100">
      <ComplianceBanner onOpenProofModal={() => setProofOpen(true)} />

      <header className="border-b border-gray-800 bg-[#0D1320]/95">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/40">
                <Clapperboard className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-white">
                    AegisFlow Rental
                  </h1>
                  <span className="rounded-full border border-gray-700 bg-gray-800/80 px-2.5 py-0.5 text-[11px] font-medium text-gray-300">
                    Northside AV &amp; Cinema Rentals
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Deposit-Gated Fleet Scheduling, AI Inspection, Price Proof &amp; Chargeback Defense
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                title="Public Single-Session Judge Demo (Horizon B commercial deployment uses SSO + role-enforced RBAC)"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-[#111827] px-2.5 py-1.5 text-[11px] text-gray-300"
              >
                <Lock className="h-3.5 w-3.5 text-emerald-400" />
                <span>Session:</span>
                <span className="font-mono text-sky-300">
                  {session.sessionId.slice(0, 8)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setAuditOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-[#111827] px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-800"
              >
                <ScrollText className="h-3.5 w-3.5 text-sky-400" />
                Audit Log
                <span className="rounded bg-blue-900/70 px-1.5 py-0.5 text-[10px] font-semibold text-blue-200">
                  {session.eventLog.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setResetOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-900/50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset My Demo Session
              </button>
            </div>
          </div>

          {/* Judge Verification Links (QA-POLISH-02) */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="mr-1 font-semibold uppercase tracking-wider text-gray-500">
              Judge Verification Links:
            </span>
            <a
              href="/api/health"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-0.5 font-mono text-emerald-300 hover:bg-emerald-900/40"
            >
              API Health (/api/health)
            </a>
            <a
              href="/openapi.yaml"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-sky-500/30 bg-sky-950/30 px-2.5 py-0.5 font-mono text-sky-300 hover:bg-sky-900/40"
            >
              OpenAPI 3.1 (/openapi.yaml)
            </a>
            <a
              href="/postman_collection.json"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-violet-500/30 bg-violet-950/30 px-2.5 py-0.5 font-mono text-violet-300 hover:bg-violet-900/40"
            >
              Postman Collection (/postman_collection.json)
            </a>
            <a
              href="https://sandbox.braintreegateway.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-amber-500/30 bg-amber-950/30 px-2.5 py-0.5 font-mono text-amber-300 hover:bg-amber-900/40"
            >
              Braintree Control Panel ↗
            </a>
          </div>

          {/* 2-Tab Primary View Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-800/80 pt-3">
            <nav aria-label="Primary Workspace Views" className="flex gap-2">
              <button
                type="button"
                onClick={() => onSelectTab("cockpit")}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  activeTab === "cockpit"
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-900/50"
                    : "border border-gray-700 bg-[#111827] text-gray-300 hover:bg-gray-800"
                }`}
              >
                <Clapperboard className="h-3.5 w-3.5" />
                Tab 1: Fleet Operations &amp; Deposit-to-Dispute Cockpit
              </button>
              <button
                type="button"
                onClick={() => onSelectTab("studio")}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  activeTab === "studio"
                    ? "bg-violet-600 text-white shadow-sm shadow-violet-900/50"
                    : "border border-gray-700 bg-[#111827] text-gray-300 hover:bg-gray-800"
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Tab 2: AG Studio 3.1 Analytics &amp; AI Assistant
              </button>
            </nav>
          </div>

          {/* 6-Step Hero Loop Progress Bar */}
          {activeTab === "cockpit" && (
            <div
              aria-label="6-Step Hero Loop Progress"
              className="grid grid-cols-2 gap-1.5 md:grid-cols-3 lg:grid-cols-6"
            >
              {STEP_LABELS.map((item) => {
                const isActive = activeStep === item.step;
                const isDone = completedSteps[item.step];
                return (
                  <button
                    key={item.step}
                    type="button"
                    onClick={() => onSelectStep(item.step)}
                    className={`flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium transition ${
                      isActive
                        ? "border-blue-500 bg-blue-950/60 text-white ring-1 ring-blue-500/40"
                        : isDone
                          ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-950/50"
                          : "border-gray-800 bg-[#111827] text-gray-400 hover:bg-gray-800/80"
                    }`}
                  >
                    <span className="truncate">{item.short}</span>
                    {isDone && (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>

      <footer className="border-t border-gray-800/80 bg-[#0D1320]/80 py-4 text-center text-xs text-gray-400">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4">
          <span>
            AegisFlow Rental &middot; Deposit-Gated Cinema &amp; Production Equipment Operations
          </span>
          <span className="font-mono text-gray-300">
            License: MIT (OSI-Approved Open Source License)
          </span>
        </div>
      </footer>

      <DiscordProofModal open={proofOpen} onClose={() => setProofOpen(false)} />
      <SessionResetModal
        open={resetOpen}
        busy={resetBusy}
        onConfirm={handleConfirmReset}
        onClose={() => setResetOpen(false)}
      />
      <AuditLogDrawer
        open={auditOpen}
        entries={session.eventLog}
        onClose={() => setAuditOpen(false)}
      />
    </div>
  );
}

