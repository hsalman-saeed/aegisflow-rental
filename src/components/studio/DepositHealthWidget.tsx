"use client";

import {
  Activity,
  DollarSign,
  Info,
  Scale,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import {
  calculateFleetFinancialMetrics,
  type FleetFinancialMetrics,
} from "@/lib/ag-studio/data-sources";
import { formatUsdCents } from "@/lib/ui/api-client";
import type { SessionData } from "@/types/domain";

interface DepositHealthWidgetProps {
  session: SessionData;
  compact?: boolean;
}

export function DepositHealthWidget({
  session,
  compact = false,
}: DepositHealthWidgetProps) {
  const metrics: FleetFinancialMetrics =
    calculateFleetFinancialMetrics(session);

  const recoveryDisplay =
    metrics.depositRecoveryRatePct === null
      ? "N/A (0 priced items)"
      : `${metrics.depositRecoveryRatePct.toFixed(1)}%`;

  const winRateDisplay =
    metrics.disputeWinRatePct === null
      ? "N/A (0 disputes)"
      : `${metrics.disputeWinRatePct.toFixed(1)}%`;

  const cards = [
    {
      key: "active-holds",
      label: "Active Holds",
      value: formatUsdCents(metrics.activeHoldsCents),
      sub: `${metrics.activeHoldsCount} open auth · ${metrics.expiringHoldsCount} ≥5d window`,
      tooltip:
        "Sum of authorized parent deposit holds across active (non-closed) bookings. Holds >= 5 days approach standard 7-day processor expiry windows.",
      icon: ShieldCheck,
      accent: "text-blue-300",
      border: "border-blue-500/30",
    },
    {
      key: "captured-to-date",
      label: "Captured to Date",
      value: formatUsdCents(metrics.capturedToDateCents),
      sub: `${metrics.capturedTransactionsCount} settled child txn(s)`,
      tooltip:
        "Total settled partial-settlement and vault-fallback child captures across all bookings.",
      icon: DollarSign,
      accent: "text-emerald-300",
      border: "border-emerald-500/30",
    },
    {
      key: "recovery-rate",
      label: "Deposit Recovery Rate (% of Priced)",
      value: recoveryDisplay,
      sub:
        metrics.totalPricedInspectionCents > 0
          ? `${formatUsdCents(metrics.capturedToDateCents)} / ${formatUsdCents(metrics.totalPricedInspectionCents)} priced`
          : "Awaiting Channel3 price lock",
      tooltip:
        "Formula: Captured-to-Date / Sum(Verified Channel3 Replacement Prices). Displays N/A until at least one discrepancy is priced.",
      icon: Activity,
      accent: "text-violet-300",
      border: "border-violet-500/30",
    },
    {
      key: "dispute-win-rate",
      label: "Dispute Win Rate",
      value: winRateDisplay,
      sub:
        metrics.totalDisputesCount > 0
          ? `${metrics.wonDisputesCount} Won · ${metrics.openDisputesCount} Open`
          : "No chargeback disputes filed",
      tooltip:
        "Formula: Won Disputes / Total Disputes. Reflects Braintree Sandbox representment outcomes.",
      icon: Scale,
      accent: "text-amber-300",
      border: "border-amber-500/30",
    },
    {
      key: "net-revenue",
      label: "Net Fleet Revenue",
      value: formatUsdCents(metrics.netFleetRevenueCents),
      sub: "Rental fees + settled net captures",
      tooltip:
        "Recognized rental fees on confirmed/dispatched/closed bookings plus signed settled transaction amounts.",
      icon: TrendingUp,
      accent: "text-cyan-300",
      border: "border-cyan-500/30",
    },
  ];

  return (
    <section
      aria-label="Deposit Health Financial KPIs"
      className={compact ? "space-y-2" : "space-y-2"}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              title={card.tooltip}
              className={`rounded-xl border ${card.border} bg-[#0B0F19] p-3.5 transition hover:border-gray-600`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-gray-400">
                  {card.label}
                </span>
                <span className="inline-flex items-center gap-1 text-gray-500">
                  <Info className="h-3 w-3" />
                  <Icon className={`h-3.5 w-3.5 ${card.accent}`} />
                </span>
              </div>
              <p className={`mt-1.5 font-mono text-lg font-bold ${card.accent}`}>
                {card.value}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-400">{card.sub}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Compact custom widget renderer usable inside AG Studio 3.1 `createWidgets`.
 */
export function DepositHealthStudioComp({
  context,
}: {
  context?: { session?: SessionData };
}) {
  if (!context?.session) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-gray-800 bg-[#0B0F19] p-3 text-xs text-gray-400">
        DepositHealthWidget awaiting live session context.
      </div>
    );
  }
  return <DepositHealthWidget session={context.session} compact />;
}

