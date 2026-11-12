import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const PORT = 3099;
const BASE_URL = process.env.AEGISFLOW_HTTP_URL || `http://127.0.0.1:${PORT}`;
const SHOULD_SPAWN = !process.env.AEGISFLOW_HTTP_URL;

async function waitForServer(url: string, timeoutMs = 25000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // server still starting
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error(`Timed out waiting for Next.js server at ${url}`);
}

class CookieClient {
  private cookieHeader = "";

  async request(
    path: string,
    init?: { method?: string; body?: unknown; headers?: Record<string, string> }
  ): Promise<Response> {
    const headers: Record<string, string> = { ...(init?.headers ?? {}) };
    if (this.cookieHeader) {
      headers["cookie"] = this.cookieHeader;
    }
    if (init?.body !== undefined && !headers["content-type"]) {
      headers["content-type"] = "application/json";
    }

    const res = await fetch(`${BASE_URL}${path}`, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const firstPair = setCookie.split(";")[0]?.trim();
      if (firstPair) {
        this.cookieHeader = firstPair;
      }
    }
    return res;
  }
}

async function runHttpVerification() {
  console.log(`=== AEGISFLOW RENTAL: LIVE HTTP SERVER E2E SMOKE (${BASE_URL}) ===`);

  // 1. GET /
  const homeRes = await fetch(`${BASE_URL}/`);
  assert.equal(homeRes.status, 200, "GET / must return 200");
  const homeHtml = await homeRes.text();
  assert.ok(homeHtml.includes("AegisFlow Rental"), "HTML must contain AegisFlow Rental");
  assert.ok(
    homeHtml.includes("PayPal Braintree Sandbox"),
    "HTML must contain PayPal Braintree Sandbox (COMP-004)"
  );
  console.log("[PASS] GET / -> HTTP 200 (AegisFlow Rental + PayPal Braintree Sandbox)");

  // 2. GET /api/health
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.equal(healthRes.status, 200, "GET /api/health must return 200");
  const healthJson = (await healthRes.json()) as { status?: string };
  assert.equal(healthJson.status, "ok", "health status must be ok");
  console.log(`[PASS] GET /api/health -> HTTP 200 (status=${healthJson.status})`);

  // 3. GET /openapi.yaml & /postman_collection.json
  const openapiRes = await fetch(`${BASE_URL}/openapi.yaml`);
  assert.equal(openapiRes.status, 200, "GET /openapi.yaml must return 200");
  const openapiText = await openapiRes.text();
  assert.ok(openapiText.includes("openapi: 3.1"), "openapi.yaml must be OpenAPI 3.1");

  const postmanRes = await fetch(`${BASE_URL}/postman_collection.json`);
  assert.equal(postmanRes.status, 200, "GET /postman_collection.json must return 200");
  const postmanJson = (await postmanRes.json()) as { info?: { name?: string } };
  assert.ok(postmanJson.info?.name, "postman_collection.json must have info.name");
  console.log("[PASS] GET /openapi.yaml & /postman_collection.json -> HTTP 200");

  // 4. Cookie-authenticated API workflow
  const client = new CookieClient();

  const sessionRes = await client.request("/api/session");
  assert.equal(sessionRes.status, 200, "GET /api/session must return 200");
  const sessionJson = (await sessionRes.json()) as {
    data: {
      bookings: Array<{ id: string; assetId: string; depositHoldCents: number }>;
      inspections: Array<{
        bookingId: string;
        items: Array<{ id: string; itemName: string }>;
      }>;
    };
  };
  const bkIds = sessionJson.data.bookings.map((b) => b.id);
  assert.ok(bkIds.includes("BK-9021") && bkIds.includes("BK-9024") && bkIds.includes("BK-9022"));
  console.log(`[PASS] GET /api/session -> HTTP 200 (bookings=${bkIds.join(", ")})`);

  // Hold BK-9021
  const hold1Res = await client.request("/api/braintree/hold", {
    method: "POST",
    body: { bookingId: "BK-9021", paymentRail: "PayPal" },
  });
  assert.equal(hold1Res.status, 200, "POST /api/braintree/hold BK-9021 must return 200");
  const hold1Json = (await hold1Res.json()) as { authStatus: string; braintreeId: string };
  assert.equal(hold1Json.authStatus, "authorized");
  assert.ok(hold1Json.braintreeId);
  console.log(
    `[PASS] POST /api/braintree/hold (BK-9021) -> HTTP 200 (authStatus=${hold1Json.authStatus}, id=${hold1Json.braintreeId})`
  );

  // Verify Live In-App Braintree Gateway Inspector endpoint (UI-FIX-07)
  const verifyLiveRes = await fetch(
    `${BASE_URL}/api/braintree/verify/${encodeURIComponent(hold1Json.braintreeId)}`
  );
  assert.equal(verifyLiveRes.status, 200, "GET /api/braintree/verify/[id] must return 200");
  const verifyLiveJson = (await verifyLiveRes.json()) as { source: string; id: string };
  assert.equal(verifyLiveJson.source, "braintree_sandbox_live");

  const verifySeedRes = await fetch(`${BASE_URL}/api/braintree/verify/bt_seed_auth_9024`);
  assert.equal(verifySeedRes.status, 200, "GET /api/braintree/verify/bt_seed_* must return 200");
  const verifySeedJson = (await verifySeedRes.json()) as { source: string };
  assert.equal(verifySeedJson.source, "seed_fixture");
  console.log(
    `[PASS] GET /api/braintree/verify/${hold1Json.braintreeId} & bt_seed_auth_9024 -> HTTP 200 (live + seed_fixture)`
  );

  // Dispatch BK-9021
  const disp1Res = await client.request("/api/bookings/dispatch", {
    method: "POST",
    body: { bookingId: "BK-9021" },
  });
  assert.equal(disp1Res.status, 200, "POST /api/bookings/dispatch BK-9021 must return 200");
  console.log("[PASS] POST /api/bookings/dispatch (BK-9021) -> HTTP 200 (dispatched)");

  // Hold BK-9022 -> processor decline 2000 -> dispatch blocked 400
  const hold2Res = await client.request("/api/braintree/hold", {
    method: "POST",
    body: { bookingId: "BK-9022", paymentRail: "PayPal" },
  });
  const hold2Json = (await hold2Res.json()) as {
    authStatus: string;
    processorCode: string;
  };
  assert.equal(hold2Json.authStatus, "declined");
  assert.equal(hold2Json.processorCode, "2000");

  const disp2Res = await client.request("/api/bookings/dispatch", {
    method: "POST",
    body: { bookingId: "BK-9022" },
  });
  assert.equal(disp2Res.status, 400, "Dispatch on declined BK-9022 must be blocked with 400");
  console.log(
    `[PASS] POST /api/braintree/hold & /dispatch (BK-9022) -> declined (code=${hold2Json.processorCode}), dispatch blocked HTTP 400`
  );

  // Inspection analyze & confirm on BK-9021
  const bk9021Insp = sessionJson.data.inspections.find((i) => i.bookingId === "BK-9021")!;
  const minorItem = bk9021Insp.items[0]!;
  const majorItem = bk9021Insp.items[1]!;

  const analyzeRes = await client.request("/api/inspection/analyze", {
    method: "POST",
    body: {
      bookingId: "BK-9021",
      returnNotes: "Battery D-Tap cracked and 24-70mm lens filter ring dented.",
      damagedItemIds: [minorItem.id, majorItem.id],
      missingItemIds: [],
    },
  });
  assert.equal(analyzeRes.status, 200, "POST /api/inspection/analyze must return 200");

  const confirmRes = await client.request("/api/inspection/confirm", {
    method: "POST",
    body: {
      bookingId: "BK-9021",
      confirmedItems: [
        { id: minorItem.id, type: "damaged", needsMaintenance: false },
        { id: majorItem.id, type: "damaged", needsMaintenance: true },
      ],
    },
  });
  assert.equal(confirmRes.status, 200, "POST /api/inspection/confirm must return 200");
  console.log("[PASS] POST /api/inspection/analyze & /confirm -> HTTP 200");

  // Channel3 price-check & lock-price
  const priceCheckRes = await client.request("/api/channel3/price-check", {
    method: "POST",
    body: {
      queries: ["99Wh V-Mount Battery", "Sigma 24-70mm f/2.8 Lens"],
    },
  });
  assert.equal(priceCheckRes.status, 200, "POST /api/channel3/price-check must return 200");

  const lock1Res = await client.request("/api/channel3/lock-price", {
    method: "POST",
    body: {
      bookingId: "BK-9021",
      itemId: minorItem.id,
      channel3ProductTitle: "SmallRig VB99 / 99Wh V-Mount Battery Accessory Kit",
      channel3RetailUrl: "https://www.newegg.com/",
      priceCents: 5380,
      priceSource: "channel3",
    },
  });
  assert.equal(lock1Res.status, 200, "POST /api/channel3/lock-price Item 1 must return 200");

  const lock2Res = await client.request("/api/channel3/lock-price", {
    method: "POST",
    body: {
      bookingId: "BK-9021",
      itemId: majorItem.id,
      channel3ProductTitle: "Sigma 24-70mm f/2.8 DG DN II Art Lens",
      channel3RetailUrl: "https://www.bhphotovideo.com/",
      priceCents: 63900,
      priceSource: "channel3",
    },
  });
  assert.equal(lock2Res.status, 200, "POST /api/channel3/lock-price Item 2 must return 200");
  console.log("[PASS] POST /api/channel3/price-check & /lock-price -> HTTP 200 ($53.80 & $639.00)");

  // Policy Gate & Partial Settlement
  const settle1Res = await client.request("/api/braintree/settle-partial", {
    method: "POST",
    body: { bookingId: "BK-9021", itemId: minorItem.id },
  });
  assert.equal(settle1Res.status, 200, "Auto-capture <= $100 must return 200");

  const settle2Blocked = await client.request("/api/braintree/settle-partial", {
    method: "POST",
    body: { bookingId: "BK-9021", itemId: majorItem.id },
  });
  assert.equal(settle2Blocked.status, 403, "Capture > $100 without approval must return 403");

  const settle2Approved = await client.request("/api/braintree/settle-partial", {
    method: "POST",
    body: { bookingId: "BK-9021", itemId: majorItem.id, humanApproved: true },
  });
  assert.equal(settle2Approved.status, 200, "Human-approved capture > $100 must return 200");
  console.log(
    "[PASS] POST /api/braintree/settle-partial -> Item1=200 (auto), Item2 unapproved=403, Item2 approved=200"
  );

  // Maintenance & Reassignment on BK-9024
  const bk9021AssetId = sessionJson.data.bookings.find((b) => b.id === "BK-9021")!.assetId;
  const maintRes = await client.request("/api/scheduler/maintenance-and-conflict", {
    method: "POST",
    body: {
      assetId: bk9021AssetId,
      bookingId: "BK-9021",
      repairReason: "48h Optical Bench Calibration & Filter Ring Repair",
    },
  });
  assert.equal(maintRes.status, 200, "POST /api/scheduler/maintenance-and-conflict must return 200");

  const reassignRes = await client.request("/api/scheduler/reassign", {
    method: "POST",
    body: {
      bookingId: "BK-9024",
      targetAssetId: "asset_fx6_unit_2",
    },
  });
  assert.equal(reassignRes.status, 200, "POST /api/scheduler/reassign must return 200");
  console.log(
    "[PASS] POST /api/scheduler/maintenance-and-conflict & /reassign -> HTTP 200 (BK-9024 -> asset_fx6_unit_2)"
  );

  // Dispute Simulate, Draft Evidence & Submit
  const simRes = await client.request("/api/braintree/dispute/simulate", {
    method: "POST",
    body: { bookingId: "BK-9021", itemId: minorItem.id },
  });
  assert.equal(simRes.status, 200, "POST /api/braintree/dispute/simulate must return 200");
  const simJson = (await simRes.json()) as {
    dispute: { id: string; amountDisputedCents: number };
  };
  assert.equal(simJson.dispute.amountDisputedCents, 6201);

  const draftRes = await client.request("/api/braintree/dispute/draft-evidence", {
    method: "POST",
    body: { disputeId: simJson.dispute.id },
  });
  assert.equal(draftRes.status, 200, "POST /api/braintree/dispute/draft-evidence must return 200");
  const draftJson = (await draftRes.json()) as {
    evidenceText: string;
    facts: {
      channel3ReplacementUsd: string;
      sandboxDisputeTriggerDeltaUsd: string;
      disputedAmountUsd: string;
    };
  };
  assert.ok(draftJson.evidenceText, "evidenceText must be non-empty");
  assert.equal(draftJson.facts.channel3ReplacementUsd, "53.80");
  assert.equal(draftJson.facts.sandboxDisputeTriggerDeltaUsd, "8.21");
  assert.equal(draftJson.facts.disputedAmountUsd, "62.01");

  const submitRes = await client.request("/api/braintree/dispute/submit", {
    method: "POST",
    body: { disputeId: simJson.dispute.id, approvedText: draftJson.evidenceText },
  });
  assert.equal(submitRes.status, 200, "POST /api/braintree/dispute/submit must return 200");
  const submitJson = (await submitRes.json()) as { status: string };
  assert.equal(submitJson.status, "Won");
  console.log(
    "[PASS] POST /api/braintree/dispute/simulate, /draft-evidence & /submit -> HTTP 200 (Won, $53.80 + $8.21 = $62.01)"
  );

  // Session Reset
  const resetRes = await client.request("/api/session/reset", {
    method: "POST",
    body: { confirm: true },
  });
  assert.equal(resetRes.status, 200, "POST /api/session/reset must return 200");
  console.log("[PASS] POST /api/session/reset -> HTTP 200 (clean reset)");
  console.log("=== ALL HTTP SERVER E2E CHECKS PASSED ===");
}

async function main() {
  let serverProc: ChildProcess | null = null;
  try {
    if (SHOULD_SPAWN) {
      serverProc = spawn(`npx next start -p ${PORT}`, {
        shell: true,
        stdio: "pipe",
      });
      await waitForServer(BASE_URL);
    }
    await runHttpVerification();
  } finally {
    if (serverProc?.pid) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(serverProc.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } else {
        serverProc.kill("SIGTERM");
      }
    }
  }
}

main().catch((err) => {
  console.error("HTTP SERVER E2E FAILED:", err);
  process.exit(1);
});

