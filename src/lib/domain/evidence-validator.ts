import { centsToBraintreeString, formatUsdDisplay } from "@/lib/domain/money";
import type {
  Booking,
  Customer,
  Dispute,
  Inspection,
  InspectionItem,
  Transaction,
} from "@/types/domain";

export interface DeterministicEvidenceFacts {
  bookingId: string;
  assetId: string;
  customerName: string;
  customerCompany: string;
  disputedItemName: string;
  parentBraintreeId: string;
  childBraintreeId: string;
  disputeId: string;
  channel3ProductTitle: string;
  channel3RetailUrl: string;
  channel3ReplacementCents: number;
  channel3ReplacementUsd: string;
  channel3ReplacementFormatted: string;
  sandboxDisputeTriggerDeltaCents: number;
  sandboxDisputeTriggerDeltaUsd: string;
  sandboxDisputeTriggerDeltaFormatted: string;
  disputedAmountCents: number;
  disputedAmountUsd: string;
  disputedAmountFormatted: string;
  depositHoldCents: number;
  depositHoldUsd: string;
  depositHoldFormatted: string;
  rentalFeeCents: number;
  rentalFeeUsd: string;
  rentalFeeFormatted: string;
  signOffTimestamp: string;
}

/** Builds whitelisted ground-truth facts from stored entities (BR-040). */
export function buildDeterministicEvidenceFacts(params: {
  booking: Booking;
  customer: Customer;
  inspection: Inspection;
  disputedItem: InspectionItem;
  parentTxn: Transaction;
  childTxn: Transaction;
  dispute: Dispute;
}): DeterministicEvidenceFacts {
  const {
    booking,
    customer,
    inspection,
    disputedItem,
    parentTxn,
    childTxn,
    dispute,
  } = params;

  const disputedAmountCents = dispute.amountDisputedCents;
  const channel3ReplacementCents =
    typeof disputedItem.channel3PriceCents === "number" &&
    disputedItem.channel3PriceCents > 0
      ? disputedItem.channel3PriceCents
      : disputedAmountCents;
  const sandboxDisputeTriggerDeltaCents = Math.max(
    0,
    disputedAmountCents - channel3ReplacementCents
  );

  return {
    bookingId: booking.id,
    assetId: booking.assetId,
    customerName: customer.name,
    customerCompany: customer.company,
    disputedItemName: disputedItem.itemName,
    parentBraintreeId: parentTxn.braintreeId,
    childBraintreeId: childTxn.braintreeId,
    disputeId: dispute.braintreeDisputeId,
    channel3ProductTitle:
      disputedItem.channel3ProductTitle ?? disputedItem.itemName,
    channel3RetailUrl:
      disputedItem.channel3RetailUrl ?? dispute.channel3ProofUrl,
    channel3ReplacementCents,
    channel3ReplacementUsd: centsToBraintreeString(channel3ReplacementCents),
    channel3ReplacementFormatted: formatUsdDisplay(channel3ReplacementCents),
    sandboxDisputeTriggerDeltaCents,
    sandboxDisputeTriggerDeltaUsd: centsToBraintreeString(
      sandboxDisputeTriggerDeltaCents
    ),
    sandboxDisputeTriggerDeltaFormatted: formatUsdDisplay(
      sandboxDisputeTriggerDeltaCents
    ),
    disputedAmountCents,
    disputedAmountUsd: centsToBraintreeString(disputedAmountCents),
    disputedAmountFormatted: formatUsdDisplay(disputedAmountCents),
    depositHoldCents: booking.depositHoldCents,
    depositHoldUsd: centsToBraintreeString(booking.depositHoldCents),
    depositHoldFormatted: formatUsdDisplay(booking.depositHoldCents),
    rentalFeeCents: booking.rentalFeeCents,
    rentalFeeUsd: centsToBraintreeString(booking.rentalFeeCents),
    rentalFeeFormatted: formatUsdDisplay(booking.rentalFeeCents),
    signOffTimestamp: inspection.signOffTimestamp ?? childTxn.createdAt,
  };
}

/** Normalizes matched currency literals (e.g. "$1,500.00" -> "1500.00"). */
function normalizeDollarLiteral(raw: string): string {
  const cleaned = raw.replace(/[$,\s]/g, "");
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : cleaned;
}

/**
 * Validates that drafted representment prose contains zero fabricated USD
 * amounts and preserves required ground-truth IDs and Channel3 URL (AC-062-1).
 */
export function validateDraftedEvidencePacket(
  draftText: string,
  facts: DeterministicEvidenceFacts
): { valid: boolean; mismatches: string[] } {
  const mismatches: string[] = [];

  if (!draftText.trim()) {
    return { valid: false, mismatches: ["Draft evidence packet cannot be empty."] };
  }

  const allowedUsdValues = new Set([
    facts.disputedAmountUsd,
    facts.channel3ReplacementUsd,
    facts.sandboxDisputeTriggerDeltaUsd,
    facts.depositHoldUsd,
    facts.rentalFeeUsd,
  ]);

  const currencyMatches = draftText.match(/\$[\d,]+(?:\.\d{1,2})?/g) ?? [];
  for (const match of currencyMatches) {
    const normalized = normalizeDollarLiteral(match);
    if (!allowedUsdValues.has(normalized)) {
      mismatches.push(
        `Unrecognized USD figure "${match}" does not match whitelisted ground truth.`
      );
    }
  }

  const requiredCitations: Array<[string, string]> = [
    ["Booking ID", facts.bookingId],
    ["Child transaction ID", facts.childBraintreeId],
    ["Channel3 proof URL", facts.channel3RetailUrl],
  ];

  for (const [label, token] of requiredCitations) {
    if (!draftText.includes(token)) {
      mismatches.push(`Missing required ground-truth ${label}: ${token}`);
    }
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  };
}

/**
 * Appends the documented Braintree sandbox auto-win sentinel ONLY when
 * executing inside Braintree Sandbox (BR-041 / AC-064-2).
 */
export function buildBraintreeEvidencePayloads(
  approvedPacketText: string,
  braintreeEnv: string
): { calls: string[]; includesSandboxSentinel: boolean } {
  const isSandbox = braintreeEnv.trim().toLowerCase() === "sandbox";
  return {
    calls: isSandbox
      ? [approvedPacketText, "compelling_evidence"]
      : [approvedPacketText],
    includesSandboxSentinel: isSandbox,
  };
}

