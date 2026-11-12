import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const braintreeSandboxConfigured = Boolean(
    process.env.BRAINTREE_MERCHANT_ID?.trim() &&
      process.env.BRAINTREE_PUBLIC_KEY?.trim() &&
      process.env.BRAINTREE_PRIVATE_KEY?.trim()
  );
  const awsBedrockNovaConfigured = Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim()
  );
  const channel3CatalogConfigured = Boolean(
    process.env.CHANNEL3_API_KEY?.trim()
  );
  const upstashRedisConfigured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );

  return NextResponse.json(
    {
      status: "ok",
      service: "AegisFlow Rental",
      releaseStage: "production-demo",
      license: "MIT (OSI-Approved)",
      environment: "sandbox",
      integrations: {
        braintreeSandboxConfigured,
        awsBedrockNovaConfigured,
        channel3CatalogConfigured,
        upstashRedisConfigured,
      },
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}

