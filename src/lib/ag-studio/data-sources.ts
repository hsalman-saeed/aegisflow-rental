import type { AgDataSourcesDefinition, AgRelationDefinition } from "ag-studio";
import type { SessionData } from "@/types/domain";

export interface StudioCustomerRow {
  id: string;
  name: string;
  company: string;
  email: string;
  paypalVaultStatus: string;
  riskTier: string;
}

export interface StudioAssetRow {
  id: string;
  name: string;
  category: string;
  serialNumber: string;
  dailyRateUsd: number;
  replacementValueUsd: number;
  status: string;
  model: string;
}

export interface StudioBookingRow {
  id: string;
  assetId: string;
  customerId: string;
  startDate: string;
  endDate: string;
  rentalFeeUsd: number;
  depositHoldUsd: number;
  authStatus: string;
  scheduleStatus: string;
  parentTransactionId: string;
}

export interface StudioTransactionRow {
  id: string;
  braintreeId: string;
  bookingId: string;
  customerId: string;
  type: string;
  captureMode: string;
  paymentMethod: string;
  amountUsd: number;
  signedAmountUsd: number;
  status: string;
  createdAt: string;
}

export interface StudioInspectionRow {
  id: string;
  bookingId: string;
  assetId: string;
  itemName: string;
  type: string;
  inspectorVerified: boolean;
  channel3ProductTitle: string;
  channel3PriceUsd: number | null;
  channel3RetailUrl: string;
  priceSource: string;
  capturedAmountUsd: number | null;
  childTransactionId: string;
  approvalMode: string;
}

export interface StudioDisputeRow {
  id: string;
  braintreeDisputeId: string;
  transactionId: string;
  bookingId: string;
  customerId: string;
  amountDisputedUsd: number;
  reason: string;
  status: string;
  triggerMethod: string;
  channel3ProofUrl: string;
  replyByDate: string;
  submissionStep: string;
}

export interface StudioTabularSnapshot {
  customers: StudioCustomerRow[];
  assets: StudioAssetRow[];
  bookings: StudioBookingRow[];
  transactions: StudioTransactionRow[];
  inspections: StudioInspectionRow[];
  disputes: StudioDisputeRow[];
}

export interface FleetFinancialMetrics {
  activeHoldsCount: number;
  activeHoldsCents: number;
  expiringHoldsCount: number;
  capturedToDateCents: number;
  capturedTransactionsCount: number;
  totalPricedInspectionCents: number;
  depositRecoveryRatePct: number | null;
  openDisputesCount: number;
  wonDisputesCount: number;
  totalDisputesCount: number;
  disputeWinRatePct: number | null;
  netFleetRevenueCents: number;
}

function centsToUsd(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Extracts normalized 6-table row arrays from SessionData for both AG Studio 3.1
 * and the interactive 6-Table Relational Explorer.
 */
export function buildStudioTabularSnapshot(
  session: SessionData
): StudioTabularSnapshot {
  const customers: StudioCustomerRow[] = session.customers.map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company,
    email: c.email,
    paypalVaultStatus: c.paypalVaultStatus,
    riskTier: c.riskTier,
  }));

  const assets: StudioAssetRow[] = session.assets.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    serialNumber: a.serialNumber,
    dailyRateUsd: centsToUsd(a.dailyRateCents),
    replacementValueUsd: centsToUsd(a.replacementValueCents),
    status: a.status,
    model: a.model,
  }));

  const bookings: StudioBookingRow[] = session.bookings.map((b) => ({
    id: b.id,
    assetId: b.assetId,
    customerId: b.customerId,
    startDate: b.startDate,
    endDate: b.endDate,
    rentalFeeUsd: centsToUsd(b.rentalFeeCents),
    depositHoldUsd: centsToUsd(b.depositHoldCents),
    authStatus: b.authStatus,
    scheduleStatus: b.scheduleStatus,
    parentTransactionId: b.parentTransactionId ?? "",
  }));

  const transactions: StudioTransactionRow[] = session.transactions.map((t) => ({
    id: t.id,
    braintreeId: t.braintreeId,
    bookingId: t.bookingId,
    customerId: t.customerId,
    type: t.type,
    captureMode: t.captureMode ?? "standard",
    paymentMethod: t.paymentMethod,
    amountUsd: centsToUsd(t.amountCents),
    signedAmountUsd: centsToUsd(t.signedAmountCents),
    status: t.status,
    createdAt: t.createdAt,
  }));

  const inspections: StudioInspectionRow[] = session.inspections.flatMap(
    (insp) =>
      insp.items.map((item) => ({
        id: item.id,
        bookingId: insp.bookingId,
        assetId: insp.assetId,
        itemName: item.itemName,
        type: item.type,
        inspectorVerified: Boolean(
          insp.inspectorVerified && item.inspectorVerified
        ),
        channel3ProductTitle: item.channel3ProductTitle ?? "",
        channel3PriceUsd:
          typeof item.channel3PriceCents === "number"
            ? centsToUsd(item.channel3PriceCents)
            : null,
        channel3RetailUrl: item.channel3RetailUrl ?? "",
        priceSource: item.priceSource,
        capturedAmountUsd:
          typeof item.capturedAmountCents === "number"
            ? centsToUsd(item.capturedAmountCents)
            : null,
        childTransactionId: item.childTransactionId ?? "",
        approvalMode: item.approvalMode ?? "pending",
      }))
  );

  const disputes: StudioDisputeRow[] = session.disputes.map((d) => ({
    id: d.id,
    braintreeDisputeId: d.braintreeDisputeId,
    transactionId: d.transactionId,
    bookingId: d.bookingId,
    customerId: d.customerId,
    amountDisputedUsd: centsToUsd(d.amountDisputedCents),
    reason: d.reason,
    status: d.status,
    triggerMethod: d.triggerMethod,
    channel3ProofUrl: d.channel3ProofUrl,
    replyByDate: d.replyByDate,
    submissionStep: d.submissionStep ?? "draft",
  }));

  return {
    customers,
    assets,
    bookings,
    transactions,
    inspections,
    disputes,
  };
}

/**
 * Builds the 6-table AG Studio 3.1 AgDataSourcesDefinition with typed fields
 * and relational foreign-key joins (`FR-070`, `AC-070-1`).
 */
export function buildStudioDataSources(
  session: SessionData
): AgDataSourcesDefinition {
  const rows = buildStudioTabularSnapshot(session);

  const relationships: AgRelationDefinition[] = [
    {
      id: "rel_bookings_customer",
      type: "many-to-one",
      source: "bookings.customerId",
      target: "customers.id",
    },
    {
      id: "rel_bookings_asset",
      type: "many-to-one",
      source: "bookings.assetId",
      target: "assets.id",
    },
    {
      id: "rel_transactions_booking",
      type: "many-to-one",
      source: "transactions.bookingId",
      target: "bookings.id",
    },
    {
      id: "rel_inspections_booking",
      type: "many-to-one",
      source: "inspections.bookingId",
      target: "bookings.id",
    },
    {
      id: "rel_disputes_booking",
      type: "many-to-one",
      source: "disputes.bookingId",
      target: "bookings.id",
    },
  ];

  return {
    description:
      "AegisFlow Rental 6-table relational telemetry: customers, assets, bookings, transactions, inspections, and disputes.",
    sources: [
      {
        id: "customers",
        name: "Customers",
        description: "Production studios and renters with Braintree vault status and risk tier.",
        primaryKeyField: "id",
        data: rows.customers as unknown as Record<string, string>[],
        fields: [
          { id: "id", name: "Customer ID", format: "textFormat" },
          { id: "name", name: "Contact Name", format: "textFormat" },
          { id: "company", name: "Company", format: "textFormat" },
          { id: "email", name: "Email", format: "textFormat" },
          { id: "paypalVaultStatus", name: "Vault Status", format: "textFormat" },
          { id: "riskTier", name: "Risk Tier", format: "textFormat" },
        ],
      },
      {
        id: "assets",
        name: "Assets",
        description: "Cinema cameras, lighting, and audio inventory with replacement values.",
        primaryKeyField: "id",
        data: rows.assets as unknown as Record<string, string | number>[],
        fields: [
          { id: "id", name: "Asset ID", format: "textFormat" },
          { id: "name", name: "Asset Name", format: "textFormat" },
          { id: "category", name: "Category", format: "textFormat" },
          { id: "serialNumber", name: "Serial Number", format: "textFormat" },
          { id: "dailyRateUsd", name: "Daily Rate ($)", format: "currencyFormat" },
          { id: "replacementValueUsd", name: "Replacement Value ($)", format: "currencyFormat" },
          { id: "status", name: "Yard Status", format: "textFormat" },
          { id: "model", name: "Model", format: "textFormat" },
        ],
      },
      {
        id: "bookings",
        name: "Bookings",
        description: "Rental reservations, deposit holds, and schedule states.",
        primaryKeyField: "id",
        data: rows.bookings as unknown as Record<string, string | number>[],
        fields: [
          { id: "id", name: "Booking ID", format: "textFormat" },
          { id: "assetId", name: "Asset ID", format: "textFormat" },
          { id: "customerId", name: "Customer ID", format: "textFormat" },
          { id: "startDate", name: "Start Date", format: "textFormat" },
          { id: "endDate", name: "End Date", format: "textFormat" },
          { id: "rentalFeeUsd", name: "Rental Fee ($)", format: "currencyFormat" },
          { id: "depositHoldUsd", name: "Deposit Hold ($)", format: "currencyFormat" },
          { id: "authStatus", name: "Auth Status", format: "textFormat" },
          { id: "scheduleStatus", name: "Schedule Status", format: "textFormat" },
          { id: "parentTransactionId", name: "Parent Braintree ID", format: "textFormat" },
        ],
      },
      {
        id: "transactions",
        name: "Transactions",
        description: "Braintree Sandbox auth holds, partial settlements, and fallback captures.",
        primaryKeyField: "id",
        data: rows.transactions as unknown as Record<string, string | number>[],
        fields: [
          { id: "id", name: "Txn ID", format: "textFormat" },
          { id: "braintreeId", name: "Braintree ID", format: "textFormat" },
          { id: "bookingId", name: "Booking ID", format: "textFormat" },
          { id: "customerId", name: "Customer ID", format: "textFormat" },
          { id: "type", name: "Type", format: "textFormat" },
          { id: "captureMode", name: "Capture Mode", format: "textFormat" },
          { id: "paymentMethod", name: "Rail", format: "textFormat" },
          { id: "amountUsd", name: "Amount ($)", format: "currencyFormat" },
          { id: "signedAmountUsd", name: "Signed Amount ($)", format: "currencyFormat" },
          { id: "status", name: "Status", format: "textFormat" },
          { id: "createdAt", name: "Created At", format: "textFormat" },
        ],
      },
      {
        id: "inspections",
        name: "Inspections",
        description: "Yard return discrepancy items with Channel3 retail price proof.",
        primaryKeyField: "id",
        data: rows.inspections as unknown as Record<
          string,
          string | number | boolean | null
        >[],
        fields: [
          { id: "id", name: "Item ID", format: "textFormat" },
          { id: "bookingId", name: "Booking ID", format: "textFormat" },
          { id: "assetId", name: "Asset ID", format: "textFormat" },
          { id: "itemName", name: "Item Name", format: "textFormat" },
          { id: "type", name: "Condition", format: "textFormat" },
          { id: "inspectorVerified", name: "Verified", format: "booleanFormat" },
          { id: "channel3ProductTitle", name: "Channel3 SKU", format: "textFormat" },
          { id: "channel3PriceUsd", name: "Channel3 Price ($)", format: "currencyFormat" },
          { id: "channel3RetailUrl", name: "Retail URL", format: "textFormat" },
          { id: "priceSource", name: "Price Source", format: "textFormat" },
          { id: "capturedAmountUsd", name: "Captured ($)", format: "currencyFormat" },
          { id: "childTransactionId", name: "Child Txn ID", format: "textFormat" },
          { id: "approvalMode", name: "Approval Mode", format: "textFormat" },
        ],
      },
      {
        id: "disputes",
        name: "Disputes",
        description: "Chargeback disputes and representment outcomes.",
        primaryKeyField: "id",
        data: rows.disputes as unknown as Record<string, string | number>[],
        fields: [
          { id: "id", name: "Dispute ID", format: "textFormat" },
          { id: "braintreeDisputeId", name: "Braintree Dispute ID", format: "textFormat" },
          { id: "transactionId", name: "Txn ID", format: "textFormat" },
          { id: "bookingId", name: "Booking ID", format: "textFormat" },
          { id: "customerId", name: "Customer ID", format: "textFormat" },
          { id: "amountDisputedUsd", name: "Disputed ($)", format: "currencyFormat" },
          { id: "reason", name: "Reason", format: "textFormat" },
          { id: "status", name: "Status", format: "textFormat" },
          { id: "triggerMethod", name: "Trigger Method", format: "textFormat" },
          { id: "channel3ProofUrl", name: "Channel3 Proof", format: "textFormat" },
          { id: "replyByDate", name: "Reply By", format: "textFormat" },
          { id: "submissionStep", name: "Submission Step", format: "textFormat" },
        ],
      },
    ],
    relationships,
  };
}

/**
 * Computes deterministic integer-cent KPIs for DepositHealthWidget (`FR-071`, `AC-070-2`).
 */
export function calculateFleetFinancialMetrics(
  session: SessionData
): FleetFinancialMetrics {
  const activeHoldBookings = session.bookings.filter(
    (b) => b.authStatus === "authorized" && b.scheduleStatus !== "closed"
  );
  const activeHoldsCount = activeHoldBookings.length;
  const activeHoldsCents = activeHoldBookings.reduce(
    (sum, b) => sum + b.depositHoldCents,
    0
  );

  // Holds spanning >= 5 days approach standard card/PayPal 7-day auth expiry window
  const expiringHoldsCount = activeHoldBookings.filter((b) => {
    const startMs = Date.parse(b.startDate);
    const endMs = Date.parse(b.endDate);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
    return (endMs - startMs) / (1000 * 60 * 60 * 24) >= 5;
  }).length;

  const settledCaptures = session.transactions.filter(
    (t) => t.type === "partial_settlement" && t.status === "settled"
  );
  const capturedTransactionsCount = settledCaptures.length;
  const capturedToDateCents = settledCaptures.reduce(
    (sum, t) => sum + t.amountCents,
    0
  );

  const totalPricedInspectionCents = session.inspections.reduce((acc, insp) => {
    if (!insp.inspectorVerified) return acc;
    const itemSum = insp.items.reduce((s, item) => {
      if (
        (item.type === "missing" || item.type === "damaged") &&
        typeof item.channel3PriceCents === "number" &&
        item.channel3PriceCents > 0
      ) {
        return s + item.channel3PriceCents;
      }
      return s;
    }, 0);
    return acc + itemSum;
  }, 0);

  const depositRecoveryRatePct =
    totalPricedInspectionCents === 0
      ? null
      : Math.round((capturedToDateCents / totalPricedInspectionCents) * 1000) /
        10;

  const totalDisputesCount = session.disputes.length;
  const openDisputesCount = session.disputes.filter(
    (d) => d.status === "Open"
  ).length;
  const wonDisputesCount = session.disputes.filter(
    (d) => d.status === "Won"
  ).length;
  const disputeWinRatePct =
    totalDisputesCount === 0
      ? null
      : Math.round((wonDisputesCount / totalDisputesCount) * 1000) / 10;

  const settledSignedCents = session.transactions
    .filter((t) => t.status === "settled")
    .reduce((sum, t) => sum + t.signedAmountCents, 0);

  const recognizedRentalFeeCents = session.bookings
    .filter((b) =>
      ["confirmed", "dispatched", "returned", "reassigned", "closed"].includes(
        b.scheduleStatus
      )
    )
    .reduce((sum, b) => sum + b.rentalFeeCents, 0);

  return {
    activeHoldsCount,
    activeHoldsCents,
    expiringHoldsCount,
    capturedToDateCents,
    capturedTransactionsCount,
    totalPricedInspectionCents,
    depositRecoveryRatePct,
    openDisputesCount,
    wonDisputesCount,
    totalDisputesCount,
    disputeWinRatePct,
    netFleetRevenueCents: recognizedRentalFeeCents + settledSignedCents,
  };
}

