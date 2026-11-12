export interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
  paypalVaultStatus: "vaulted" | "none";
  riskTier: "A" | "B" | "C";
}

export interface Asset {
  id: string;
  name: string;
  category: "Cinema Cameras" | "Lighting" | "Audio";
  serialNumber: string;
  dailyRateCents: number;
  replacementValueCents: number;
  status: "available" | "rented" | "maintenance";
  model: string;
}

export interface Booking {
  id: string;
  assetId: string;
  customerId: string;
  startDate: string;
  endDate: string;
  rentalFeeCents: number;
  depositHoldCents: number;
  authStatus: "pending" | "authorized" | "declined" | "error";
  parentTransactionId?: string;
  scheduleStatus:
    | "tentative"
    | "confirmed"
    | "dispatched"
    | "returned"
    | "reassigned"
    | "at_risk"
    | "closed";
}

export interface Transaction {
  id: string;
  braintreeId: string;
  parentTransactionId?: string;
  bookingId: string;
  customerId: string;
  type: "auth_hold" | "partial_settlement" | "refund" | "dispute_test";
  captureMode?: "partial_settlement" | "fallback_vault_capture";
  paymentMethod: "PayPal" | "Venmo" | "Visa";
  amountCents: number;
  signedAmountCents: number;
  status: "authorized" | "settled" | "processor_declined" | "voided";
  createdAt: string;
}

export interface InspectionItem {
  id: string;
  itemName: string;
  type: "missing" | "damaged" | "ok";
  evidenceNotes: string;
  needsMaintenance: boolean;
  inspectorVerified: boolean;
  channel3ProductTitle?: string;
  channel3PriceCents?: number;
  channel3RetailUrl?: string;
  channel3RetrievedAt?: string;
  priceSource: "channel3" | "manual_source";
  capturedAmountCents?: number;
  childTransactionId?: string;
  approvalMode?: "auto_under_cap" | "human_approved" | "rejected";
}

export interface Inspection {
  id: string;
  bookingId: string;
  assetId: string;
  inspectorVerified: boolean;
  signOffTimestamp?: string;
  items: InspectionItem[];
}

export interface Dispute {
  id: string;
  braintreeDisputeId: string;
  transactionId: string;
  bookingId: string;
  customerId: string;
  amountDisputedCents: number;
  reason: string;
  status: "Open" | "Won" | "Lost";
  triggerMethod: "venmo_6201" | "test_card_instant";
  evidencePacketSummary: string;
  channel3ProofUrl: string;
  replyByDate: string;
  submissionStep?: "draft" | "evidence_added" | "finalized";
}

export interface EventLogEntry {
  id: string;
  timestamp: string;
  actorRole: "Yard Manager" | "Finance Approver" | "System / AI";
  action: string;
  entityType: "booking" | "transaction" | "inspection" | "dispute";
  entityId: string;
  metadata: Record<string, unknown>;
}

export interface MaintenanceBlock {
  id: string;
  assetId: string;
  reason: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

export interface SessionData {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  customers: Customer[];
  assets: Asset[];
  bookings: Booking[];
  transactions: Transaction[];
  inspections: Inspection[];
  disputes: Dispute[];
  maintenanceBlocks: MaintenanceBlock[];
  eventLog: EventLogEntry[];
}

