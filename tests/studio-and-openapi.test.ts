import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkDisputeEvidenceReadiness } from "@/lib/ag-studio/bedrock-nova-adapter";
import {
  buildStudioDataSources,
  calculateFleetFinancialMetrics,
} from "@/lib/ag-studio/data-sources";
import { createInitialSessionState } from "@/lib/store/seed-data";

const ALL_16_ROUTES = [
  "/api/session",
  "/api/session/reset",
  "/api/bookings",
  "/api/bookings/dispatch",
  "/api/braintree/hold",
  "/api/inspection/analyze",
  "/api/inspection/confirm",
  "/api/channel3/price-check",
  "/api/channel3/lock-price",
  "/api/braintree/settle-partial",
  "/api/scheduler/maintenance-and-conflict",
  "/api/scheduler/reassign",
  "/api/braintree/dispute/simulate",
  "/api/braintree/dispute/draft-evidence",
  "/api/braintree/dispute/submit",
  "/api/ai/nova-stream",
];

function collectFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFilesRecursive(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

describe("T-070: AG Studio 3.1 6-Table Data Sources, Financial Metrics & Readiness Tool", () => {
  it("builds all 6 relational tables and foreign-key relationships (AC-070-1)", () => {
    const session = createInitialSessionState("test-studio-001");
    const ds = buildStudioDataSources(session);

    const tableIds = ds.sources.map((s) => s.id);
    expect(tableIds).toEqual([
      "customers",
      "assets",
      "bookings",
      "transactions",
      "inspections",
      "disputes",
    ]);
    expect(ds.relationships?.length).toBeGreaterThanOrEqual(5);
  });

  it("returns null depositRecoveryRatePct when 0 items are priced, and 100 when $53.80 + $639.00 are priced & captured (AC-070-2)", () => {
    const session = createInitialSessionState("test-studio-002");
    const baseline = calculateFleetFinancialMetrics(session);
    expect(baseline.totalPricedInspectionCents).toBe(0);
    expect(baseline.depositRecoveryRatePct).toBeNull();
    expect(baseline.disputeWinRatePct).toBeNull();

    // Simulate Steps 1-4 for BK-9021 with $53.80 (5380) and $639.00 (63900)
    const booking = session.bookings.find((b) => b.id === "BK-9021")!;
    booking.authStatus = "authorized";
    booking.parentTransactionId = "bt_parent_9021";

    const insp = session.inspections.find((i) => i.bookingId === "BK-9021")!;
    insp.inspectorVerified = true;
    insp.signOffTimestamp = "2026-11-12T10:00:00.000Z";
    insp.items = [
      {
        id: "ITEM-01",
        itemName: "SanDisk 128GB Extreme PRO SDXC Card",
        type: "missing",
        evidenceNotes: "Missing card slot A",
        needsMaintenance: false,
        inspectorVerified: true,
        channel3ProductTitle: "SanDisk 128GB Extreme Pro SDXC UHS-I Card",
        channel3PriceCents: 5380,
        channel3RetailUrl: "https://www.newegg.com/sandisk-128gb",
        priceSource: "channel3",
        capturedAmountCents: 5380,
        childTransactionId: "bt_child_5380",
        approvalMode: "auto_under_cap",
      },
      {
        id: "ITEM-02",
        itemName: "Rode NTG5 Shotgun Microphone",
        type: "damaged",
        evidenceNotes: "Bent XLR housing",
        needsMaintenance: true,
        inspectorVerified: true,
        channel3ProductTitle: "RODE NTG5 Shotgun Microphone Kit",
        channel3PriceCents: 63900,
        channel3RetailUrl: "https://www.bhphotovideo.com/rode-ntg5",
        priceSource: "channel3",
        capturedAmountCents: 63900,
        childTransactionId: "bt_child_63900",
        approvalMode: "human_approved",
      },
    ];

    session.transactions.push(
      {
        id: "txn_c1",
        braintreeId: "bt_child_5380",
        parentTransactionId: "bt_parent_9021",
        bookingId: "BK-9021",
        customerId: booking.customerId,
        type: "partial_settlement",
        captureMode: "partial_settlement",
        paymentMethod: "PayPal",
        amountCents: 5380,
        signedAmountCents: 5380,
        status: "settled",
        createdAt: "2026-11-12T10:01:00.000Z",
      },
      {
        id: "txn_c2",
        braintreeId: "bt_child_63900",
        parentTransactionId: "bt_parent_9021",
        bookingId: "BK-9021",
        customerId: booking.customerId,
        type: "partial_settlement",
        captureMode: "partial_settlement",
        paymentMethod: "PayPal",
        amountCents: 63900,
        signedAmountCents: 63900,
        status: "settled",
        createdAt: "2026-11-12T10:02:00.000Z",
      }
    );

    const updated = calculateFleetFinancialMetrics(session);
    expect(updated.totalPricedInspectionCents).toBe(69280);
    expect(updated.capturedToDateCents).toBe(69280);
    expect(updated.depositRecoveryRatePct).toBe(100);
  });

  it("runs checkDisputeEvidenceReadiness read-only and tracks 4/4 readiness pillars (AC-073-1)", () => {
    const session = createInitialSessionState("test-studio-003");
    const snapshotBefore = JSON.stringify(session);

    const initialReport = checkDisputeEvidenceReadiness(session, "BK-9021");
    expect(initialReport.readyForRepresentment).toBe(false);
    expect(initialReport.passedCount).toBeLessThan(4);
    expect(JSON.stringify(session)).toBe(snapshotBefore);

    // Complete pillars 1-4
    const booking = session.bookings.find((b) => b.id === "BK-9021")!;
    booking.authStatus = "authorized";
    booking.parentTransactionId = "bt_parent_9021";

    const insp = session.inspections.find((i) => i.bookingId === "BK-9021")!;
    insp.inspectorVerified = true;
    insp.signOffTimestamp = "2026-11-12T10:00:00.000Z";
    insp.items = [
      {
        id: "ITEM-01",
        itemName: "SanDisk 128GB Extreme PRO SDXC Card",
        type: "missing",
        evidenceNotes: "Missing card",
        needsMaintenance: false,
        inspectorVerified: true,
        channel3PriceCents: 5380,
        channel3RetailUrl: "https://www.newegg.com/sandisk-128gb",
        priceSource: "channel3",
      },
    ];
    session.transactions.push({
      id: "txn_c1",
      braintreeId: "bt_child_5380",
      bookingId: "BK-9021",
      customerId: booking.customerId,
      type: "partial_settlement",
      paymentMethod: "PayPal",
      amountCents: 5380,
      signedAmountCents: 5380,
      status: "settled",
      createdAt: "2026-11-12T10:01:00.000Z",
    });

    const readyReport = checkDisputeEvidenceReadiness(session, "BK-9021");
    expect(readyReport.readyForRepresentment).toBe(true);
    expect(readyReport.passedCount).toBe(4);
    expect(readyReport.score).toBe("4/4");
  });
});

describe("T-080 & T-081: Compliance Banner & Audit Log Integrity", () => {
  it("surfaces sandbox compliance disclosure and audit log drawer rendering (AC-080-1, AC-081-1)", () => {
    const bannerSrc = readFileSync(
      path.resolve(process.cwd(), "src/components/layout/ComplianceBanner.tsx"),
      "utf8"
    );
    expect(bannerSrc).toMatch(/Sandbox/i);
    expect(bannerSrc).toMatch(/Braintree/i);

    const drawerSrc = readFileSync(
      path.resolve(process.cwd(), "src/components/layout/AuditLogDrawer.tsx"),
      "utf8"
    );
    const appShellSrc = readFileSync(
      path.resolve(process.cwd(), "src/components/layout/AppShell.tsx"),
      "utf8"
    );
    expect(appShellSrc).toContain("eventLog");
    expect(drawerSrc).toContain("EventLogEntry");
    expect(drawerSrc).toContain("actorRole");
  });
});

describe("T-090: OpenAPI 3.1 Spec, Postman Collection & Zero-Secret Hygiene (AC-090-1, NFR-001)", () => {
  it("documents all 16 /api/* routes in docs/openapi.yaml and docs/postman_collection.json with zero secrets", () => {
    const openapiPath = path.resolve(process.cwd(), "docs/openapi.yaml");
    const postmanPath = path.resolve(
      process.cwd(),
      "docs/postman_collection.json"
    );

    expect(existsSync(openapiPath)).toBe(true);
    expect(existsSync(postmanPath)).toBe(true);

    const openapiText = readFileSync(openapiPath, "utf8");
    const postmanText = readFileSync(postmanPath, "utf8");
    expect(openapiText).toContain("openapi: 3.1.0");

    for (const route of ALL_16_ROUTES) {
      expect(openapiText).toContain(route);
      expect(postmanText).toContain(route);
    }

    // Verify no secret env names or values leak into docs or client components
    const componentFiles = collectFilesRecursive(
      path.resolve(process.cwd(), "src/components")
    );
    for (const file of componentFiles) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain("BRAINTREE_PRIVATE_KEY");
      expect(content).not.toContain("AWS_SECRET_ACCESS_KEY");
    }

    const envLocalPath = path.resolve(process.cwd(), ".env.local");
    if (existsSync(envLocalPath)) {
      const secretKeys = [
        "BRAINTREE_PRIVATE_KEY",
        "AWS_SECRET_ACCESS_KEY",
        "CHANNEL3_API_KEY",
        "UPSTASH_REDIS_REST_TOKEN",
      ];
      const lines = readFileSync(envLocalPath, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const eqIdx = line.indexOf("=");
        if (eqIdx === -1) continue;
        const k = line.slice(0, eqIdx).trim();
        const v = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (secretKeys.includes(k) && v.length >= 8) {
          expect(openapiText).not.toContain(v);
          expect(postmanText).not.toContain(v);
          for (const file of componentFiles) {
            expect(readFileSync(file, "utf8")).not.toContain(v);
          }
        }
      }
    }
  });
});

