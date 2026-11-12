import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/braintree/client", () => ({
  authorizeDepositHold: vi.fn(async ({ amountCents }) => {
    if (amountCents >= 200000) {
      return {
        success: false,
        braintreeId: "bt_declined_2000",
        status: "processor_declined",
        processorCode: "2000",
        processorText: "Do Not Honor",
        paymentMethodUsed: "Visa",
      };
    }
    return {
      success: true,
      braintreeId: "bt_auth_mock_1500",
      status: "authorized",
      processorCode: "1000",
      processorText: "Approved",
      paymentMethodUsed: "Visa",
    };
  }),
  executePartialDepositCapture: vi.fn(async ({ orderId }) => ({
    success: true,
    childBraintreeId: `bt_child_${orderId}`,
    status: "settled",
    captureMode: "fallback_vault_capture",
    parentStatusAfter: "authorized",
  })),
  simulateSandboxDispute: vi.fn(async ({ bookingId, amountCents }) => ({
    braintreeDisputeId: `disp_mock_${bookingId}`,
    transactionId: "bt_disp_txn_1",
    amountDisputedCents: amountCents,
    status: "Open",
    reason: "1000 - Damaged / Missing Equipment Deduction Disputed",
    replyByDate: "2026-11-22T00:00:00.000Z",
    triggerMethod: "test_card_instant",
  })),
  submitDisputeEvidenceAndFinalize: vi.fn(async () => ({
    status: "Won",
    submissionStep: "finalized",
    sentinelIncluded: true,
  })),
}));

vi.mock("@/lib/bedrock/client", () => ({
  analyzeReturnDiscrepanciesWithNova: vi.fn(async () => ({
    candidates: [
      {
        itemId: "item_sdxc",
        type: "missing",
        evidenceNotes: "Pelican card slot B empty on check-in.",
        needsMaintenance: false,
      },
      {
        itemId: "item_ntg5_mic",
        type: "damaged",
        evidenceNotes: "Shock mount snapped; 48h calibration required.",
        needsMaintenance: true,
      },
    ],
    modelUsed: "us.amazon.nova-pro-v1:0",
    aiSource: "amazon-nova-pro",
    aiAvailable: true,
    latencyMs: 120,
    usedFallback: false,
  })),
  generateBackupReassignmentRationaleWithNova: vi.fn(async ({ eligibleBackups }) => ({
    recommendedAssetId: eligibleBackups[0]?.id ?? null,
    rationale: "Sony FX6 Backup Unit #2 matches specs with zero booking overlaps.",
    modelUsed: "us.amazon.nova-pro-v1:0",
    aiSource: "amazon-nova-pro",
    aiAvailable: true,
  })),
  draftDisputeRepresentmentWithNova: vi.fn(),
  streamStudioAssistantWithNova: vi.fn(),
}));

import { POST as dispatchBooking } from "@/app/api/bookings/dispatch/route";
import { POST as submitDispute } from "@/app/api/braintree/dispute/submit/route";
import { POST as simulateDispute } from "@/app/api/braintree/dispute/simulate/route";
import { POST as holdDeposit } from "@/app/api/braintree/hold/route";
import { POST as settlePartial } from "@/app/api/braintree/settle-partial/route";
import { POST as lockPrice } from "@/app/api/channel3/lock-price/route";
import { POST as analyzeInspection } from "@/app/api/inspection/analyze/route";
import { POST as confirmInspection } from "@/app/api/inspection/confirm/route";
import { POST as scanMaintenanceConflict } from "@/app/api/scheduler/maintenance-and-conflict/route";
import { POST as reassignBooking } from "@/app/api/scheduler/reassign/route";
import { POST as resetSessionRoute } from "@/app/api/session/reset/route";
import { GET as getSessionRoute } from "@/app/api/session/route";
import { saveSession } from "@/lib/store";
import { createInitialSessionState } from "@/lib/store/seed-data";

const createdSessionIds: string[] = [];

function makeRequest(
  url: string,
  method: "GET" | "POST",
  sessionId: string,
  body?: unknown
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-aegisflow-session": sessionId,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("Milestone 2 Backend API Integration Suite", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterAll(() => {
    for (const id of createdSessionIds) {
      try {
        rmSync(path.resolve(process.cwd(), "data", "sessions", `${id}.json`), {
          force: true,
        });
      } catch {
        // Ignore cleanup failures
      }
    }
  });

  it("seeds an isolated Northside AV session and resets cleanly", async () => {
    const sid = `test_${randomUUID().slice(0, 8)}`;
    createdSessionIds.push(sid);

    const getRes = await getSessionRoute(
      makeRequest("http://localhost/api/session", "GET", sid)
    );
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.data.bookings).toHaveLength(3);
    expect(getJson.data.assets).toHaveLength(4);
    expect(getJson.data.customers).toHaveLength(3);

    const resetRes = await resetSessionRoute(
      makeRequest("http://localhost/api/session/reset", "POST", sid, { confirm: true })
    );
    expect(resetRes.status).toBe(200);
    const resetJson = await resetRes.json();
    expect(resetJson.success).toBe(true);
    expect(resetJson.data.bookings[0].id).toBe("BK-9021");
  });

  it("ignores client-supplied amounts (AC-011-2) and blocks dispatch on declined holds (AC-013-1)", async () => {
    const sid = `test_${randomUUID().slice(0, 8)}`;
    createdSessionIds.push(sid);

    // BK-9022 has server depositHoldCents = 200000 ($2,000.00 -> decline);
    // attacker tries sending amount: 1 (cents) & amountCents: 1 in payload.
    const declinedRes = await holdDeposit(
      makeRequest("http://localhost/api/braintree/hold", "POST", sid, {
        bookingId: "BK-9022",
        amount: 1,
        amountCents: 1,
      })
    );
    expect(declinedRes.status).toBe(402);
    const declinedJson = await declinedRes.json();
    expect(declinedJson.authStatus).toBe("declined");
    expect(declinedJson.data.transactions.at(-1).amountCents).toBe(200000);

    // AC-013-1: Dispatch must be blocked on declined booking BK-9022
    const dispatchBlocked = await dispatchBooking(
      makeRequest("http://localhost/api/bookings/dispatch", "POST", sid, {
        bookingId: "BK-9022",
      })
    );
    expect(dispatchBlocked.status).toBe(400);
  });

  it("runs the full 6-step route lifecycle with HITL policy gate, backup reassignment, and dispute evidence checks", async () => {
    const sid = `test_${randomUUID().slice(0, 8)}`;
    createdSessionIds.push(sid);
    await saveSession(sid, createInitialSessionState(sid));

    // Step 1: Authorize $1,500 hold on BK-9021 & dispatch
    const holdRes = await holdDeposit(
      makeRequest("http://localhost/api/braintree/hold", "POST", sid, {
        bookingId: "BK-9021",
        paymentRail: "PayPal",
      })
    );
    expect(holdRes.status).toBe(200);
    expect((await holdRes.json()).authStatus).toBe("authorized");

    const dispatchRes = await dispatchBooking(
      makeRequest("http://localhost/api/bookings/dispatch", "POST", sid, {
        bookingId: "BK-9021",
      })
    );
    expect(dispatchRes.status).toBe(200);
    expect((await dispatchRes.json()).scheduleStatus).toBe("dispatched");

    // Step 2: Analyze & Inspector Verify
    const analyzeRes = await analyzeInspection(
      makeRequest("http://localhost/api/inspection/analyze", "POST", sid, {
        bookingId: "BK-9021",
      })
    );
    expect(analyzeRes.status).toBe(200);
    expect((await analyzeRes.json()).discrepancies).toHaveLength(2);

    const confirmRes = await confirmInspection(
      makeRequest("http://localhost/api/inspection/confirm", "POST", sid, {
        bookingId: "BK-9021",
      })
    );
    expect(confirmRes.status).toBe(200);
    expect((await confirmRes.json()).inspection.inspectorVerified).toBe(true);

    // Step 3: Lock retail price proofs (<=$100 for SDXC, >$100 for NTG5 Mic)
    const lockSdxc = await lockPrice(
      makeRequest("http://localhost/api/channel3/lock-price", "POST", sid, {
        bookingId: "BK-9021",
        itemId: "item_sdxc",
        channel3ProductTitle: "SanDisk 128GB Extreme PRO SDXC",
        channel3RetailUrl: "https://www.newegg.com/example-sdxc",
        priceCents: 5380,
      })
    );
    expect(lockSdxc.status).toBe(200);

    const lockMic = await lockPrice(
      makeRequest("http://localhost/api/channel3/lock-price", "POST", sid, {
        bookingId: "BK-9021",
        itemId: "item_ntg5_mic",
        channel3ProductTitle: "Rode NTG5 Shotgun Microphone Kit",
        channel3RetailUrl: "https://www.bhphotovideo.com/example-ntg5",
        priceCents: 63900,
      })
    );
    expect(lockMic.status).toBe(200);

    // Step 4: Policy Gate — $53.80 auto-captures; $639.00 blocked without approval, succeeds with approval
    const autoSettle = await settlePartial(
      makeRequest("http://localhost/api/braintree/settle-partial", "POST", sid, {
        itemId: "item_sdxc",
      })
    );
    expect(autoSettle.status).toBe(200);
    const autoJson = await autoSettle.json();
    expect(autoJson.route).toBe("auto_under_cap");
    expect(autoJson.isFinalCapture).toBe(false);

    const blockedSettle = await settlePartial(
      makeRequest("http://localhost/api/braintree/settle-partial", "POST", sid, {
        itemId: "item_ntg5_mic",
        humanApproved: false,
      })
    );
    expect(blockedSettle.status).toBe(403);

    const approvedSettle = await settlePartial(
      makeRequest("http://localhost/api/braintree/settle-partial", "POST", sid, {
        itemId: "item_ntg5_mic",
        humanApproved: true,
      })
    );
    expect(approvedSettle.status).toBe(200);
    const approvedJson = await approvedSettle.json();
    expect(approvedJson.route).toBe("human_approval");
    expect(approvedJson.isFinalCapture).toBe(true);

    // Step 5: 48h Maintenance Conflict Scan & Reassignment to Backup Unit #2
    const conflictRes = await scanMaintenanceConflict(
      makeRequest("http://localhost/api/scheduler/maintenance-and-conflict", "POST", sid, {
        assetId: "asset_fx6_unit_1",
        bookingId: "BK-9021",
      })
    );
    expect(conflictRes.status).toBe(200);
    const conflictJson = await conflictRes.json();
    expect(conflictJson.conflicts.map((b: { id: string }) => b.id)).toContain("BK-9024");
    expect(conflictJson.recommendations[0].recommendedAssetId).toBe("asset_fx6_unit_2");

    // Reject invalid assetId outside eligible backups (AC-052-1)
    const badReassign = await reassignBooking(
      makeRequest("http://localhost/api/scheduler/reassign", "POST", sid, {
        bookingId: "BK-9024",
        targetAssetId: "asset_aputure_600d",
      })
    );
    expect(badReassign.status).toBe(409);

    const goodReassign = await reassignBooking(
      makeRequest("http://localhost/api/scheduler/reassign", "POST", sid, {
        bookingId: "BK-9024",
        targetAssetId: "asset_fx6_unit_2",
      })
    );
    expect(goodReassign.status).toBe(200);
    expect((await goodReassign.json()).booking.scheduleStatus).toBe("reassigned");

    // Step 6: Simulate Dispute & Verify BR-040 Validation Blocks Tampered Dollar Amount
    const simDispRes = await simulateDispute(
      makeRequest("http://localhost/api/braintree/dispute/simulate", "POST", sid, {
        childTxnId: autoJson.childTxnId,
      })
    );
    expect(simDispRes.status).toBe(200);
    const disputeId = (await simDispRes.json()).dispute.id as string;

    const invalidSubmit = await submitDispute(
      makeRequest("http://localhost/api/braintree/dispute/submit", "POST", sid, {
        disputeId,
        approvedText:
          "Booking BK-9021 child bt_child_BK-9021-item_sdxc proof https://www.newegg.com/example-sdxc fee $999.99.",
      })
    );
    expect(invalidSubmit.status).toBe(400);

    const validSubmit = await submitDispute(
      makeRequest("http://localhost/api/braintree/dispute/submit", "POST", sid, {
        disputeId,
        approvedText:
          "Booking BK-9021 hold $1,500.00 settled $53.80 via bt_child_BK-9021-item_sdxc backed by https://www.newegg.com/example-sdxc.",
      })
    );
    expect(validSubmit.status).toBe(200);
    expect((await validSubmit.json()).status).toBe("Won");
  });
});

