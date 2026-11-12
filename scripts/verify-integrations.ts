import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import braintree from "braintree";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { Redis } from "@upstash/redis";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function isPopulated(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && !trimmed.startsWith("your_");
}

function readPackageVersion(pkgName: string): string {
  const pkgJsonPath = path.resolve(
    process.cwd(),
    "node_modules",
    ...pkgName.split("/"),
    "package.json"
  );
  if (!existsSync(pkgJsonPath)) return "NOT INSTALLED";
  const raw = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as { version?: string };
  return raw.version ?? "UNKNOWN";
}

function extractDtsExports(pkgName: string): string[] {
  const pkgDir = path.resolve(process.cwd(), "node_modules", ...pkgName.split("/"));
  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (!existsSync(pkgJsonPath)) return ["[package.json not found]"];

  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
    types?: string;
    typings?: string;
    exports?: Record<string, unknown>;
  };

  const candidates = [
    pkg.types,
    pkg.typings,
    "dist/index.d.ts",
    "lib/index.d.ts",
    "index.d.ts",
    "types/index.d.ts",
  ].filter((c): c is string => Boolean(c));

  const exportNames = new Set<string>();

  for (const rel of candidates) {
    const full = path.resolve(pkgDir, rel);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, "utf8");
    const regex =
      /export\s+(?:declare\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z0-9_]+)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      exportNames.add(m[1]);
    }
    const namedBlockRegex = /export\s*\{([^}]+)\}/g;
    while ((m = namedBlockRegex.exec(text)) !== null) {
      for (const part of m[1].split(",")) {
        const cleaned = part.trim().split(/\s+as\s+/i).pop()?.trim();
        if (cleaned) exportNames.add(cleaned);
      }
    }
    const starReexportRegex = /export\s+\*\s+from\s+['"]\.\/([^'"]+)['"]/g;
    while ((m = starReexportRegex.exec(text)) !== null) {
      exportNames.add(m[1]);
    }
    if (exportNames.size > 0) break;
  }

  return exportNames.size > 0
    ? Array.from(exportNames).slice(0, 40)
    : ["[no direct .d.ts symbol match found at root entry]"];
}

function inspectInstalledPackages(): void {
  console.log("\n=== 1. INSTALLED PACKAGES & TYPE EXPORTS (VERIFY-004 PREP) ===");
  const pkgs = [
    "next",
    "react",
    "react-dom",
    "braintree",
    "@aws-sdk/client-bedrock-runtime",
    "ag-studio",
    "ag-studio-react",
    "@bryntum/scheduler",
    "@bryntum/scheduler-react",
  ];

  for (const pkg of pkgs) {
    console.log(`- ${pkg}: ${readPackageVersion(pkg)}`);
  }

  for (const studioPkg of ["ag-studio", "ag-studio-react", "@bryntum/scheduler-react"]) {
    console.log(`\n[Exports in ${studioPkg}]`);
    console.log(extractDtsExports(studioPkg).join(", "));
  }
}

async function runBraintreeSmoke(): Promise<void> {
  console.log("\n=== 2. PAYPAL BRAINTREE SANDBOX (VERIFY-001 & VERIFY-002) ===");
  const merchantId = process.env.BRAINTREE_MERCHANT_ID;
  const publicKey = process.env.BRAINTREE_PUBLIC_KEY;
  const privateKey = process.env.BRAINTREE_PRIVATE_KEY;

  if (
    !isPopulated(merchantId) ||
    !isPopulated(publicKey) ||
    !isPopulated(privateKey)
  ) {
    console.log("[PENDING USER .env.local KEY — READY TO RUN]");
    return;
  }

  const gateway = new braintree.BraintreeGateway({
    environment: braintree.Environment.Sandbox,
    merchantId: merchantId!,
    publicKey: publicKey!,
    privateKey: privateKey!,
  });

  console.log(
    `Key presence: merchantId=${isPopulated(merchantId)}, publicKey=${isPopulated(publicKey)}, privateKey=${isPopulated(privateKey)}`
  );

  // VERIFY-001 Test A: Test PayPal / Visa authorization hold ($1,500.00, submitForSettlement: false)
  const testNonces = [
    "fake-paypal-one-time-nonce",
    "fake-paypal-billing-agreement-nonce",
    "fake-valid-visa-nonce",
  ];

  let authorizedParentId: string | undefined;
  let authorizedNonceUsed = "";

  for (const nonce of testNonces) {
    try {
      const holdResult = await gateway.transaction.sale({
        amount: "1500.00",
        paymentMethodNonce: nonce,
        options: { submitForSettlement: false },
      });
      console.log(
        `VERIFY-001 Auth Hold ($1500.00, ${nonce}): success=${holdResult.success}, status=${holdResult.transaction?.status ?? "n/a"}, processorCode=${holdResult.transaction?.processorResponseCode ?? "n/a"}, message=${holdResult.message ?? "ok"}, id=${holdResult.transaction?.id ?? "n/a"}`
      );
      if (holdResult.success && holdResult.transaction?.id && !authorizedParentId) {
        authorizedParentId = holdResult.transaction.id;
        authorizedNonceUsed = nonce;
      }
    } catch (err) {
      console.log(
        `VERIFY-001 Auth Hold (${nonce}) exception:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // VERIFY-001 Test B: Partial Settlement ($62.01) + Vaulted Token Fallback (AUDIT-COND-001)
  if (authorizedParentId) {
    try {
      const partial = await gateway.transaction.submitForPartialSettlement(
        authorizedParentId,
        "62.01"
      );
      console.log(
        `VERIFY-001 Partial Settle ($62.01 on ${authorizedNonceUsed}): success=${partial.success}, status=${partial.transaction?.status ?? "n/a"}, message=${partial.message ?? "ok"}, childId=${partial.transaction?.id ?? "n/a"}`
      );
    } catch (err) {
      console.log(
        "VERIFY-001 Partial Settle exception:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Test Vaulted Customer + PaymentMethodToken fallback (AUDIT-COND-001)
  try {
    const custRes = await gateway.customer.create({
      firstName: "AegisFlow",
      lastName: "Verify",
      paymentMethodNonce: "fake-valid-visa-nonce",
    });
    const token = custRes.customer?.paymentMethods?.[0]?.token;
    console.log(
      `VERIFY-001 Vault Customer: success=${custRes.success}, tokenCreated=${Boolean(token)}`
    );
    if (token) {
      const vaultPartial = await gateway.transaction.sale({
        amount: "62.01",
        paymentMethodToken: token,
        options: { submitForSettlement: true },
      });
      console.log(
        `VERIFY-001 Vault Token Child Capture ($62.01): success=${vaultPartial.success}, status=${vaultPartial.transaction?.status ?? "n/a"}, id=${vaultPartial.transaction?.id ?? "n/a"}`
      );
    }
  } catch (err) {
    console.log(
      "VERIFY-001 Vault fallback exception:",
      err instanceof Error ? err.message : String(err)
    );
  }

  // VERIFY-001 Test C: Processor Decline ($2,000.00)
  const declineNonce = authorizedNonceUsed || "fake-valid-visa-nonce";
  const declined = await gateway.transaction.sale({
    amount: "2000.00",
    paymentMethodNonce: declineNonce,
    options: { submitForSettlement: false },
  });
  console.log(
    `VERIFY-001 Processor Decline ($2000.00, ${declineNonce}): success=${declined.success}, status=${declined.transaction?.status ?? "rejected"}, code=${declined.transaction?.processorResponseCode ?? "n/a"}, text=${declined.transaction?.processorResponseText ?? declined.message ?? "n/a"}`
  );

  // VERIFY-002: Venmo $62.01 dispute trigger & Instant-Dispute Card 4012002033330026
  const disputeAttempts: Array<{ label: string; request: Parameters<typeof gateway.transaction.sale>[0] }> = [
    {
      label: "Venmo $62.01 (fake-venmo-account-nonce)",
      request: {
        amount: "62.01",
        paymentMethodNonce: "fake-venmo-account-nonce",
        options: { submitForSettlement: true },
      },
    },
    {
      label: "Test Card 4023898493988028 ($62.01)",
      request: {
        amount: "62.01",
        creditCard: { number: "4023898493988028", expirationDate: "12/2028" },
        options: { submitForSettlement: true },
      },
    },
  ];

  let openedDisputeId: string | undefined;
  for (const attempt of disputeAttempts) {
    try {
      const dispSale = await gateway.transaction.sale(attempt.request);
      const disputes = dispSale.transaction?.disputes ?? [];
      console.log(
        `VERIFY-002 ${attempt.label}: success=${dispSale.success}, txnId=${dispSale.transaction?.id ?? "n/a"}, status=${dispSale.transaction?.status ?? "n/a"}, message=${dispSale.message ?? "ok"}, inlineDisputes=${disputes.length}`
      );
      if (disputes[0]?.id && !openedDisputeId) {
        openedDisputeId = disputes[0].id;
      } else if (dispSale.transaction?.id && !openedDisputeId) {
        const searchStream = gateway.dispute.search((search) =>
          search.status().in(["Open", "Disputed"])
        );
        for await (const d of searchStream as AsyncIterable<{ id: string; status: string; transaction?: { id: string } }>) {
          if (d.transaction?.id === dispSale.transaction.id) {
            console.log(`VERIFY-002 Search found dispute id=${d.id}, status=${d.status}`);
            openedDisputeId = d.id;
            break;
          }
        }
      }
    } catch (err) {
      console.log(
        `VERIFY-002 ${attempt.label} exception:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  if (openedDisputeId) {
    const add1 = await gateway.dispute.addTextEvidence(openedDisputeId, {
      content: "AegisFlow Rental verified inspection & Channel3 proof",
    });
    const add2 = await gateway.dispute.addTextEvidence(openedDisputeId, {
      content: "compelling_evidence",
    });
    const finalized = await gateway.dispute.finalize(openedDisputeId);
    const fetched = await gateway.dispute.find(openedDisputeId);
    console.log(
      `VERIFY-002 Dispute Lifecycle (id=${openedDisputeId}): add1=${add1.success}, add2=${add2.success}, finalize=${finalized.success}, finalStatus=${fetched?.status ?? "unknown"}`
    );
  } else {
    console.log("VERIFY-002 Note: No open sandbox dispute was returned by tested triggers.");
  }
}

interface Channel3SearchResponse {
  products?: Array<{
    id: string;
    title: string;
    offers?: Array<{
      url: string;
      domain: string;
      price?: { price: number; currency: string; compare_at_price?: number };
    }>;
  }>;
}

async function runChannel3Smoke(): Promise<void> {
  console.log("\n=== 3. CHANNEL3 CATALOG API (VERIFY-003) ===");
  const apiKey = process.env.CHANNEL3_API_KEY;
  console.log(`Key presence: apiKey=${isPopulated(apiKey)}`);
  if (!isPopulated(apiKey)) {
    console.log("[PENDING USER .env.local KEY — READY TO RUN]");
    return;
  }

  const queries = [
    "SanDisk 128GB Extreme PRO SDXC Card",
    "SmallRig Mini Matte Box",
    "Sony NP-FZ100 Battery",
    "Rode NTG5 Shotgun Microphone",
    "Aputure Light Dome II",
    "Tilta Nucleus-Nano II",
    "Kondor Blue HDMI Cable",
    "Sennheiser EW 112P G4",
    "Atomos Ninja V Monitor",
    "Manfrotto 504X Fluid Head",
  ];

  let hits = 0;
  for (const q of queries) {
    const res = await fetch("https://api.trychannel3.com/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey!,
      },
      body: JSON.stringify({ query: q, limit: 5 }),
    });
    if (res.ok) {
      const json = (await res.json()) as Channel3SearchResponse;
      const firstOffer = json.products
        ?.flatMap((p) =>
          (p.offers ?? []).map((o) => ({ title: p.title, offer: o }))
        )
        .find(
          (entry) =>
            typeof entry.offer.price?.price === "number" &&
            entry.offer.price.price > 0 &&
            Boolean(entry.offer.url)
        );
      if (firstOffer) {
        hits += 1;
        console.log(
          `- "${q}": HTTP ${res.status} | $${firstOffer.offer.price!.price} (${firstOffer.offer.domain}) | ${firstOffer.title.slice(0, 60)}`
        );
      } else {
        console.log(`- "${q}": HTTP ${res.status} | 0 priced offers (products=${json.products?.length ?? 0})`);
      }
    } else {
      console.log(`- "${q}": HTTP ${res.status}`);
    }
  }
  console.log(`VERIFY-003 Summary: ${hits}/${queries.length} accessories returned priced retail matches (target >= 7/10).`);
}

async function runBedrockSmoke(): Promise<void> {
  console.log("\n=== 4. AWS BEDROCK AMAZON NOVA (VERIFY-004) ===");
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "us-east-1";

  console.log(
    `Key presence: accessKeyId=${isPopulated(accessKeyId)}, secretAccessKey=${isPopulated(secretAccessKey)}, region=${region}`
  );
  if (!isPopulated(accessKeyId) || !isPopulated(secretAccessKey)) {
    console.log("[PENDING USER .env.local KEY — READY TO RUN]");
    return;
  }

  const client = new BedrockRuntimeClient({
    region,
    credentials: {
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
    },
  });

  const startMs = Date.now();
  const resp = await client.send(
    new ConverseCommand({
      modelId: "us.amazon.nova-pro-v1:0",
      messages: [
        {
          role: "user",
          content: [{ text: "Respond in 4 words: Nova Pro connected successfully." }],
        },
      ],
      inferenceConfig: { maxTokens: 32, temperature: 0 },
    })
  );
  const proText = resp.output?.message?.content?.[0]?.text ?? "";
  console.log(
    `VERIFY-004 Nova Pro Converse: "${proText.trim()}" | latencyMs=${Date.now() - startMs} | usage=${JSON.stringify(resp.usage ?? {})}`
  );

  // Also test ConverseStream on Nova Lite
  const streamStart = Date.now();
  const streamResp = await client.send(
    new ConverseStreamCommand({
      modelId: "us.amazon.nova-lite-v1:0",
      messages: [
        {
          role: "user",
          content: [{ text: "Reply with 3 words: NOVA_STREAM_OK" }],
        },
      ],
      inferenceConfig: { maxTokens: 32, temperature: 0 },
    })
  );
  let streamedText = "";
  if (streamResp.stream) {
    for await (const chunk of streamResp.stream) {
      if (chunk.contentBlockDelta?.delta?.text) {
        streamedText += chunk.contentBlockDelta.delta.text;
      }
    }
  }
  console.log(
    `VERIFY-004 Nova Lite Stream: "${streamedText.trim()}" | latencyMs=${Date.now() - streamStart}`
  );
}

async function runUpstashSmoke(): Promise<void> {
  console.log("\n=== 5. UPSTASH SERVERLESS REDIS (VERIFY-005) ===");
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  console.log(`Key presence: url=${isPopulated(url)}, token=${isPopulated(token)}`);

  if (!isPopulated(url) || !isPopulated(token)) {
    console.log("[UPSTASH NOT CONFIGURED — LOCAL FILE STORE FALLBACK ACTIVE]");
    return;
  }

  const redis = new Redis({ url: url!, token: token! });
  await redis.set("aegisflow:healthcheck", "ok", { ex: 60 });
  const value = await redis.get<string>("aegisflow:healthcheck");
  console.log(`VERIFY-005 Upstash Redis healthcheck readback: ${value}`);
}

async function main(): Promise<void> {
  inspectInstalledPackages();
  await runBraintreeSmoke();
  await runChannel3Smoke();
  await runBedrockSmoke();
  await runUpstashSmoke();
}

main().catch((err) => {
  console.error("Verification script error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

