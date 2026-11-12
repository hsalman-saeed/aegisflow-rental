import { config } from "dotenv";
config({ path: ".env.local" });

import assert from "node:assert/strict";
import {
  buildStudioDataSources,
  calculateFleetFinancialMetrics,
} from "../src/lib/ag-studio/data-sources";
import { checkDisputeEvidenceReadiness } from "../src/lib/ag-studio/bedrock-nova-adapter";
import {
  analyzeReturnDiscrepanciesWithNova,
  draftDisputeRepresentmentWithNova,
  generateBackupReassignmentRationaleWithNova,
} from "../src/lib/bedrock/client";
import {
  authorizeDepositHold,
  executePartialDepositCapture,
  simulateSandboxDispute,
  submitDisputeEvidenceAndFinalize,
} from "../src/lib/braintree/client";
import { searchChannel3ReplacementPrice } from "../src/lib/channel3/client";
import {
  createMaintenanceWindow,
  detectMaintenanceConflicts,
  findEligibleBackupAssets,
} from "../src/lib/domain/conflict-engine";
import {
  buildDeterministicEvidenceFacts,
  validateDraftedEvidencePacket,
} from "../src/lib/domain/evidence-validator";
import { evaluateDepositCapturePolicy } from "../src/lib/domain/policy-gate";
import { formatUsdDisplay } from "../src/lib/domain/money";
import { createInitialSessionState } from "../src/lib/store/seed-data";
import { resetSession, saveSession } from "../src/lib/store";

async function main() {
  const sessionId = `e2e-verify-${Date.now()}`;
  console.log("=== AEGISFLOW RENTAL: LIVE E2E 6-STEP HERO LOOP (T-001..T-070) ===");

  // Step 0 (T-001): Session Seed & Reset Isolation
  let session = createInitialSessionState(sessionId);
  await saveSession(sessionId, session);
  session = await resetSession(sessionId);
  assert.equal(session.customers.length, 3, "Expected 3 seeded customers");
  assert.equal(session.assets.length, 4, "Expected 4 seeded assets");
  assert.equal(session.bookings.length, 3, "Expected 3 seeded bookings");
  console.log(
    `[PASS] T-001 Step 0: Seeded session ${sessionId} (3 customers, 4 assets, 3 bookings)`
  );

  // Step 1A (T-010): $1,500.00 Auth Hold & Dispatch on BK-9021
  const bk9021 = session.bookings.find((b) => b.id === "BK-9021")!;
  const cust1 = session.customers.find((c) => c.id === bk9021.customerId)!;
  const auth1 = await authorizeDepositHold({
    bookingId: bk9021.id,
    amountCents: bk9021.depositHoldCents,
    paymentRail: "PayPal",
  });
  assert.equal(auth1.success, true, "BK-9021 $1,500 hold must authorize");
  assert.equal(auth1.status, "authorized");
  bk9021.authStatus = "authorized";
  bk9021.parentTransactionId = auth1.braintreeId;
  bk9021.scheduleStatus = "dispatched";
  const parentTxn = {
    id: `txn_parent_${Date.now()}`,
    braintreeId: auth1.braintreeId,
    bookingId: bk9021.id,
    customerId: bk9021.customerId,
    type: "auth_hold" as const,
    paymentMethod: auth1.paymentMethodUsed,
    amountCents: bk9021.depositHoldCents,
    signedAmountCents: 0,
    status: "authorized" as const,
    createdAt: new Date().toISOString(),
  };
  session.transactions.push(parentTxn);
  console.log(
    `[PASS] T-010 Step 1A: BK-9021 authorized $1,500.00 | rail=${auth1.paymentMethodUsed} | braintreeId=${auth1.braintreeId} | scheduleStatus=dispatched`
  );

  // Step 1B (T-012): $2,000.00 Declined Hold on BK-9022
  const bk9022 = session.bookings.find((b) => b.id === "BK-9022")!;
  const auth2 = await authorizeDepositHold({
    bookingId: bk9022.id,
    amountCents: bk9022.depositHoldCents,
    paymentRail: "PayPal",
  });
  assert.equal(auth2.success, false, "BK-9022 $2,000 hold must decline");
  assert.equal(auth2.status, "processor_declined");
  assert.equal(bk9022.scheduleStatus, "tentative");
  console.log(
    `[PASS] T-012 Step 1B: BK-9022 declined $2,000.00 | code=${auth2.processorCode} (${auth2.processorText}) | dispatch blocked`
  );

  // Step 2 (T-020): Live Amazon Nova Return Discrepancy Analysis & Yard Sign-Off
  const insp9021 = session.inspections.find((i) => i.bookingId === "BK-9021")!;
  const missingSeed = insp9021.items.find((it) =>
    it.itemName.toLowerCase().includes("sandisk")
  );
  const damagedSeed = insp9021.items.find((it) =>
    it.itemName.toLowerCase().includes("rode")
  );
  const novaAnalysis = await analyzeReturnDiscrepanciesWithNova({
    handoverChecklist: insp9021.items,
    returnNotes:
      "Missing SanDisk 128GB Extreme PRO SDXC Card in Slot A; Rode NTG5 Shotgun Microphone XLR housing is bent and needs 48h maintenance.",
    missingItemIds: missingSeed ? [missingSeed.id] : [],
    damagedItemIds: damagedSeed ? [damagedSeed.id] : [],
  });
  assert.equal(novaAnalysis.aiAvailable, true, "Expected live Bedrock Nova");
  const flaggedCandidates = novaAnalysis.candidates.filter(
    (c) => c.type === "missing" || c.type === "damaged"
  );
  assert.ok(
    flaggedCandidates.length >= 2,
    "Expected >= 2 detected discrepancies"
  );
  const signOffIso = new Date().toISOString();
  insp9021.inspectorVerified = true;
  insp9021.signOffTimestamp = signOffIso;
  const candidateMap = new Map(flaggedCandidates.map((c) => [c.itemId, c]));
  insp9021.items = insp9021.items.map((it) => {
    const match = candidateMap.get(it.id);
    if (!match) return { ...it, inspectorVerified: true };
    return {
      ...it,
      type: match.type,
      evidenceNotes: match.evidenceNotes,
      needsMaintenance: match.needsMaintenance,
      inspectorVerified: true,
    };
  });
  const flaggedItems = insp9021.items.filter(
    (it) => it.type === "missing" || it.type === "damaged"
  );
  bk9021.scheduleStatus = "returned";
  console.log(
    `[PASS] T-020 Step 2: Live Nova (${novaAnalysis.modelUsed}) detected ${flaggedItems.length} discrepancies | aiAvailable=${novaAnalysis.aiAvailable} | signOff=${signOffIso}`
  );

  // Step 3 (T-030): Live Channel3 Retail Price Proof (<= $100 and > $100)
  const item1 = flaggedItems[0]!;
  const item2 = flaggedItems[1]!;
  const c3Query1 = item1.itemName.toLowerCase().includes("sandisk")
    ? item1.itemName
    : "SanDisk 128GB Extreme PRO SDXC Card";
  const c3Query2 = item2.itemName.toLowerCase().includes("rode")
    ? item2.itemName
    : "Rode NTG5 Shotgun Microphone";

  const [res1, res2] = await Promise.all([
    searchChannel3ReplacementPrice(c3Query1),
    searchChannel3ReplacementPrice(c3Query2),
  ]);
  const pick1 =
    res1.candidates.find((c) => c.priceCents > 0 && c.priceCents <= 10000) ??
    res1.candidates[0];
  const pick2 =
    res2.candidates.find((c) => c.priceCents > 10000) ?? res2.candidates[0];
  assert.ok(pick1 && pick1.priceCents <= 10000, "Item 1 must be <= $100.00");
  assert.ok(pick2 && pick2.priceCents > 10000, "Item 2 must be > $100.00");

  item1.channel3ProductTitle = pick1.title;
  item1.channel3PriceCents = pick1.priceCents;
  item1.channel3RetailUrl = pick1.retailUrl;
  item1.channel3RetrievedAt = pick1.retrievedAt;

  item2.channel3ProductTitle = pick2.title;
  item2.channel3PriceCents = pick2.priceCents;
  item2.channel3RetailUrl = pick2.retailUrl;
  item2.channel3RetrievedAt = pick2.retrievedAt;

  console.log(
    `[PASS] T-030 Step 3: Channel3 locked Item1=${formatUsdDisplay(pick1.priceCents)} (${pick1.merchantDomain}) & Item2=${formatUsdDisplay(pick2.priceCents)} (${pick2.merchantDomain})`
  );

  // Step 4 (T-040 & T-041): $100 Policy Gate & Live Braintree Child Captures
  const gate1 = evaluateDepositCapturePolicy({
    item: item1,
    inspectionVerified: insp9021.inspectorVerified,
    parentAuthStatus: bk9021.authStatus,
    parentAuthorizedCents: bk9021.depositHoldCents,
    existingCapturedCents: 0,
    alreadyCapturedItemIds: [],
    humanApproved: false,
  });
  assert.equal(gate1.allowed, true);
  assert.equal(gate1.route, "auto_under_cap");

  const [firstName, ...restName] = cust1.name.split(" ");
  const cap1 = await executePartialDepositCapture({
    parentTransactionId: bk9021.parentTransactionId!,
    amountCents: gate1.amountCents,
    orderId: `${bk9021.id}-${item1.id}`,
    isFinalCapture: false,
    customerFirstName: firstName || "Maya",
    customerLastName: restName.join(" ") || "Lin",
    customerEmail: cust1.email,
  });
  assert.equal(cap1.success, true);
  item1.capturedAmountCents = gate1.amountCents;
  item1.childTransactionId = cap1.childBraintreeId;
  item1.approvalMode = "auto_under_cap";
  const childTxn1 = {
    id: `txn_c1_${Date.now()}`,
    braintreeId: cap1.childBraintreeId,
    parentTransactionId: bk9021.parentTransactionId,
    bookingId: bk9021.id,
    customerId: bk9021.customerId,
    type: "partial_settlement" as const,
    captureMode: cap1.captureMode,
    paymentMethod: auth1.paymentMethodUsed,
    amountCents: gate1.amountCents,
    signedAmountCents: gate1.amountCents,
    status: "settled" as const,
    createdAt: new Date().toISOString(),
  };
  session.transactions.push(childTxn1);

  const gate2Blocked = evaluateDepositCapturePolicy({
    item: item2,
    inspectionVerified: insp9021.inspectorVerified,
    parentAuthStatus: bk9021.authStatus,
    parentAuthorizedCents: bk9021.depositHoldCents,
    existingCapturedCents: gate1.amountCents,
    alreadyCapturedItemIds: [item1.id],
    humanApproved: false,
  });
  assert.equal(gate2Blocked.allowed, false);
  assert.equal(gate2Blocked.requiresApprovalCard, true);

  const gate2Approved = evaluateDepositCapturePolicy({
    item: item2,
    inspectionVerified: insp9021.inspectorVerified,
    parentAuthStatus: bk9021.authStatus,
    parentAuthorizedCents: bk9021.depositHoldCents,
    existingCapturedCents: gate1.amountCents,
    alreadyCapturedItemIds: [item1.id],
    humanApproved: true,
  });
  assert.equal(gate2Approved.allowed, true);
  assert.equal(gate2Approved.route, "human_approval");

  const cap2 = await executePartialDepositCapture({
    parentTransactionId: bk9021.parentTransactionId!,
    amountCents: gate2Approved.amountCents,
    orderId: `${bk9021.id}-${item2.id}`,
    isFinalCapture: true,
    customerFirstName: firstName || "Maya",
    customerLastName: restName.join(" ") || "Lin",
    customerEmail: cust1.email,
  });
  assert.equal(cap2.success, true);
  item2.capturedAmountCents = gate2Approved.amountCents;
  item2.childTransactionId = cap2.childBraintreeId;
  item2.approvalMode = "human_approved";
  session.transactions.push({
    id: `txn_c2_${Date.now()}`,
    braintreeId: cap2.childBraintreeId,
    parentTransactionId: bk9021.parentTransactionId,
    bookingId: bk9021.id,
    customerId: bk9021.customerId,
    type: "partial_settlement",
    captureMode: cap2.captureMode,
    paymentMethod: auth1.paymentMethodUsed,
    amountCents: gate2Approved.amountCents,
    signedAmountCents: gate2Approved.amountCents,
    status: "settled",
    createdAt: new Date().toISOString(),
  });
  console.log(
    `[PASS] T-040/T-041 Step 4: Auto-capture=${cap1.childBraintreeId} (${cap1.captureMode}) | Human-approved=${cap2.childBraintreeId} (${cap2.captureMode})`
  );

  // Step 5 (T-050): 48h Maintenance Block, Conflict Detection & Backup Reassignment
  const maintWindow = createMaintenanceWindow("2026-11-12T12:00:00.000Z");
  session.maintenanceBlocks.push({
    id: `MNT-${Date.now()}`,
    assetId: bk9021.assetId,
    reason: "48h Audio Port & Acoustic Inspection",
    startDate: maintWindow.startDate,
    endDate: maintWindow.endDate,
    createdAt: new Date().toISOString(),
  });
  const conflicts = detectMaintenanceConflicts(
    bk9021.assetId,
    maintWindow,
    session.bookings
  );
  assert.ok(
    conflicts.some((c) => c.id === "BK-9024"),
    "Expected BK-9024 conflict"
  );
  const bk9024 = conflicts.find((c) => c.id === "BK-9024")!;
  const backups = findEligibleBackupAssets(
    bk9024,
    session.assets,
    session.bookings,
    bk9021.assetId
  );
  assert.ok(backups.length >= 1, "Expected Sony FX6 Backup Unit #2");
  const damagedAsset = session.assets.find((a) => a.id === bk9021.assetId)!;
  const aiReassign = await generateBackupReassignmentRationaleWithNova({
    conflictingBooking: bk9024,
    damagedAsset,
    eligibleBackups: backups,
  });
  bk9024.assetId = aiReassign.recommendedAssetId ?? backups[0]!.id;
  bk9024.scheduleStatus = "reassigned";
  console.log(
    `[PASS] T-050 Step 5: Conflict BK-9024 reassigned -> ${bk9024.assetId} | Nova=${aiReassign.modelUsed} (aiAvailable=${aiReassign.aiAvailable})`
  );

  // Step 6A (T-060): Simulate Sandbox Dispute, Draft Grounded Packet, Validate & Finalize
  const simDispute = await simulateSandboxDispute({
    bookingId: bk9021.id,
    amountCents: 6201,
  });
  const disputeRecord = {
    id: `DSP-${Date.now()}`,
    braintreeDisputeId: simDispute.braintreeDisputeId,
    transactionId: childTxn1.id,
    bookingId: bk9021.id,
    customerId: bk9021.customerId,
    amountDisputedCents: simDispute.amountDisputedCents,
    reason: simDispute.reason,
    status: "Open" as "Open" | "Won" | "Lost",
    triggerMethod: simDispute.triggerMethod,
    evidencePacketSummary: "",
    channel3ProofUrl: item1.channel3RetailUrl!,
    replyByDate: simDispute.replyByDate,
    submissionStep: "draft" as "draft" | "evidence_added" | "finalized",
  };
  const facts = buildDeterministicEvidenceFacts({
    booking: bk9021,
    customer: cust1,
    inspection: insp9021,
    disputedItem: item1,
    parentTxn,
    childTxn: childTxn1,
    dispute: disputeRecord,
  });
  const drafted = await draftDisputeRepresentmentWithNova(facts);
  const validation = validateDraftedEvidencePacket(drafted.evidenceText, facts);
  assert.equal(validation.valid, true, "Representment brief must pass BR-040");
  const finalized = await submitDisputeEvidenceAndFinalize({
    braintreeDisputeId: simDispute.braintreeDisputeId,
    approvedPacketText: drafted.evidenceText,
  });
  disputeRecord.evidencePacketSummary = drafted.evidenceText;
  disputeRecord.status = finalized.status;
  disputeRecord.submissionStep = "finalized";
  session.disputes.push(disputeRecord);
  console.log(
    `[PASS] T-060 Step 6A: Dispute ${simDispute.braintreeDisputeId} (${simDispute.triggerMethod}) drafted (${drafted.modelUsed}) -> finalized (${finalized.status}, sentinel=${finalized.sentinelIncluded})`
  );

  // Step 6B (T-070): AG Studio 3.1 6-Table Snapshot, Recovery KPI & 4/4 Readiness
  const studioDs = buildStudioDataSources(session);
  const kpis = calculateFleetFinancialMetrics(session);
  const readiness = checkDisputeEvidenceReadiness(session, bk9021.id);
  assert.equal(studioDs.sources.length, 6);
  assert.equal(kpis.depositRecoveryRatePct, 100);
  assert.equal(readiness.readyForRepresentment, true);
  assert.equal(readiness.score, "4/4");
  await saveSession(sessionId, session);

  console.log(
    `[PASS] T-070 Step 6B: AG Studio 6 tables ready | Recovery=${kpis.depositRecoveryRatePct}% | Readiness=${readiness.score} (${readiness.readyForRepresentment})`
  );
  console.log("=== ALL 6 HERO STEPS & LIVE CLOUD INTEGRATIONS VERIFIED ===");
}

main().catch((err) => {
  console.error("E2E VERIFICATION FAILED:", err);
  process.exit(1);
});
