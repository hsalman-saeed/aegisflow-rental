import type { Booking, InspectionItem } from "@/types/domain";

/** Immutable server threshold: charges > $100.00 require human approval. */
export const AUTO_CAPTURE_CAP_CENTS = 10000;

export interface PolicyGateInput {
  item: InspectionItem;
  inspectionVerified: boolean;
  parentAuthStatus: Booking["authStatus"];
  parentAuthorizedCents: number;
  existingCapturedCents: number;
  alreadyCapturedItemIds: string[];
  humanApproved?: boolean;
  rejectionReason?: string;
}

export type PolicyGateRoute = "auto_under_cap" | "human_approval" | "blocked";

export interface PolicyGateDecision {
  allowed: boolean;
  route: PolicyGateRoute;
  amountCents: number;
  requiresApprovalCard: boolean;
  rejected?: boolean;
  rejectionReason?: string;
  blockCode?:
    | "PARENT_NOT_AUTHORIZED"
    | "INSPECTION_NOT_VERIFIED"
    | "PRICE_PROOF_MISSING"
    | "DUPLICATE_ITEM_CAPTURE"
    | "EXCEEDS_AUTHORIZED_HOLD";
  reason: string;
}

/**
 * Deterministically evaluates whether an inspection discrepancy deduction can be
 * settled immediately or must pause for the Finance Approver card (BR-011..013).
 * Prompt-injection guard (NFR-007): strictly ignores free-text notes.
 */
export function evaluateDepositCapturePolicy(
  input: PolicyGateInput
): PolicyGateDecision {
  const {
    item,
    inspectionVerified,
    parentAuthStatus,
    parentAuthorizedCents,
    existingCapturedCents,
    alreadyCapturedItemIds,
    humanApproved,
    rejectionReason,
  } = input;

  const priceCents = item.channel3PriceCents ?? 0;

  if (parentAuthStatus !== "authorized") {
    return {
      allowed: false,
      route: "blocked",
      amountCents: priceCents,
      requiresApprovalCard: false,
      blockCode: "PARENT_NOT_AUTHORIZED",
      reason: "Parent deposit authorization hold is not in authorized state.",
    };
  }

  if (!inspectionVerified || !item.inspectorVerified) {
    return {
      allowed: false,
      route: "blocked",
      amountCents: priceCents,
      requiresApprovalCard: false,
      blockCode: "INSPECTION_NOT_VERIFIED",
      reason: "Return inspection must be verified by an Inspector prior to settlement.",
    };
  }

  if (priceCents <= 0 || !item.channel3RetailUrl) {
    return {
      allowed: false,
      route: "blocked",
      amountCents: priceCents,
      requiresApprovalCard: false,
      blockCode: "PRICE_PROOF_MISSING",
      reason: "Locked retail replacement price and verifiable proof URL are required.",
    };
  }

  if (alreadyCapturedItemIds.includes(item.id)) {
    return {
      allowed: false,
      route: "blocked",
      amountCents: priceCents,
      requiresApprovalCard: false,
      blockCode: "DUPLICATE_ITEM_CAPTURE",
      reason: `Inspection item ${item.id} has already been settled.`,
    };
  }

  if (existingCapturedCents + priceCents > parentAuthorizedCents) {
    return {
      allowed: false,
      route: "blocked",
      amountCents: priceCents,
      requiresApprovalCard: false,
      blockCode: "EXCEEDS_AUTHORIZED_HOLD",
      reason: "Cumulative partial captures cannot exceed the parent authorized hold.",
    };
  }

  if (priceCents <= AUTO_CAPTURE_CAP_CENTS) {
    return {
      allowed: true,
      route: "auto_under_cap",
      amountCents: priceCents,
      requiresApprovalCard: false,
      reason: "Item price is at or below $100.00 auto-capture policy threshold.",
    };
  }

  if (rejectionReason && !humanApproved) {
    return {
      allowed: false,
      route: "human_approval",
      amountCents: priceCents,
      requiresApprovalCard: false,
      rejected: true,
      rejectionReason,
      reason: "Finance Approver rejected settlement above $100.00 threshold.",
    };
  }

  const approved = Boolean(humanApproved);
  return {
    allowed: approved,
    route: "human_approval",
    amountCents: priceCents,
    requiresApprovalCard: !approved,
    reason: approved
      ? "Finance Approver authorized settlement above $100.00 threshold."
      : "Item exceeds $100.00 cap and requires explicit human approval.",
  };
}

