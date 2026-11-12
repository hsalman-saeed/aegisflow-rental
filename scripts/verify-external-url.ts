import assert from "node:assert/strict";

const TARGET_URL = (
  process.argv[2] ||
  process.env.DEPLOY_URL ||
  "http://127.0.0.1:3099"
).replace(/\/+$/, "");

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

    const res = await fetch(`${TARGET_URL}${path}`, {
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

async function main() {
  console.log(`=== AEGISFLOW RENTAL: EXTERNAL DEPLOYMENT VERIFICATION (${TARGET_URL}) ===`);

  // 1. GET /
  const homeRes = await fetch(`${TARGET_URL}/`);
  assert.equal(homeRes.status, 200, "GET / must return 200");
  const nosniff = homeRes.headers.get("x-content-type-options");
  if (nosniff) {
    assert.equal(nosniff.toLowerCase(), "nosniff");
  }
  const homeHtml = await homeRes.text();
  assert.ok(homeHtml.includes("AegisFlow Rental"), "HTML must contain AegisFlow Rental");
  assert.ok(
    homeHtml.includes("PayPal Braintree Sandbox"),
    "HTML must contain PayPal Braintree Sandbox disclosure"
  );
  console.log(
    `[PASS] GET / -> HTTP 200 (PayPal Braintree Sandbox banner present, X-Content-Type-Options=${nosniff ?? "not-set-in-local-next"})`
  );

  // 2. GET /api/health
  const healthRes = await fetch(`${TARGET_URL}/api/health`);
  assert.equal(healthRes.status, 200, "GET /api/health must return 200");
  const healthJson = (await healthRes.json()) as {
    status?: string;
    license?: string;
    integrations?: Record<string, boolean>;
  };
  assert.equal(healthJson.status, "ok", "health status must be ok");
  assert.equal(healthJson.license, "MIT (OSI-Approved)");
  for (const [key, val] of Object.entries(healthJson.integrations ?? {})) {
    assert.equal(val, true, `Integration ${key} must be true`);
  }
  console.log("[PASS] GET /api/health -> HTTP 200 (status=ok, license=MIT, 4/4 integrations true)");

  // 3. GET /openapi.yaml & /postman_collection.json
  const openapiRes = await fetch(`${TARGET_URL}/openapi.yaml`);
  assert.equal(openapiRes.status, 200, "GET /openapi.yaml must return 200");
  const openapiText = await openapiRes.text();
  assert.ok(
    openapiText.includes("MIT License (OSI-Approved Open Source License)"),
    "openapi.yaml must declare OSI MIT License"
  );

  const postmanRes = await fetch(`${TARGET_URL}/postman_collection.json`);
  assert.equal(postmanRes.status, 200, "GET /postman_collection.json must return 200");
  console.log("[PASS] GET /openapi.yaml & /postman_collection.json -> HTTP 200 (OSI MIT verified)");

  // 4. Isolated Cookie Session + Live Braintree Hold & Verify + Clean Reset
  const client = new CookieClient();

  const sessionRes = await client.request("/api/session");
  assert.equal(sessionRes.status, 200, "GET /api/session must return 200");
  console.log("[PASS] GET /api/session -> HTTP 200 (isolated aegisflow_sid cookie issued)");

  const holdRes = await client.request("/api/braintree/hold", {
    method: "POST",
    body: { bookingId: "BK-9021", paymentRail: "PayPal" },
  });
  assert.equal(holdRes.status, 200, "POST /api/braintree/hold BK-9021 must return 200");
  const holdJson = (await holdRes.json()) as {
    authStatus: string;
    braintreeId: string;
  };
  assert.equal(holdJson.authStatus, "authorized");
  assert.ok(holdJson.braintreeId);

  const verifyRes = await client.request(
    `/api/braintree/verify/${encodeURIComponent(holdJson.braintreeId)}`
  );
  assert.equal(verifyRes.status, 200, "GET /api/braintree/verify/[id] must return 200");
  const verifyJson = (await verifyRes.json()) as { source: string };
  assert.equal(verifyJson.source, "braintree_sandbox_live");
  console.log(
    `[PASS] POST /api/braintree/hold + GET /api/braintree/verify/${holdJson.braintreeId} -> HTTP 200 (braintree_sandbox_live)`
  );

  const resetRes = await client.request("/api/session/reset", {
    method: "POST",
    body: { confirm: true },
  });
  assert.equal(resetRes.status, 200, "POST /api/session/reset must return 200");
  console.log("[PASS] POST /api/session/reset -> HTTP 200 (clean baseline restored)");
  console.log("=== EXTERNAL DEPLOYMENT VERIFICATION PASSED ===");
}

main().catch((err) => {
  console.error("EXTERNAL VERIFICATION FAILED:", err);
  process.exit(1);
});
