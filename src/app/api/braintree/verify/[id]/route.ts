import { NextRequest, NextResponse } from "next/server";
import { getBraintreeGateway } from "@/lib/braintree/client";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: { id: string } }
) {
  const id = decodeURIComponent(context.params.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing Braintree record ID." }, { status: 400 });
  }

  if (id.startsWith("bt_seed_")) {
    return NextResponse.json(
      {
        source: "seed_fixture",
        id,
        note: "Pre-seeded baseline fixture record. Authorize a live hold in Step 1 to generate a live Braintree Sandbox transaction.",
      },
      { status: 200 }
    );
  }

  try {
    const gateway = getBraintreeGateway();

    try {
      const tx = await gateway.transaction.find(id);
      return NextResponse.json(
        {
          source: "braintree_sandbox_live",
          recordType: "transaction",
          id: tx.id,
          status: tx.status,
          amount: tx.amount,
          currencyIsoCode: tx.currencyIsoCode,
          type: tx.type,
          paymentInstrumentType: tx.paymentInstrumentType,
          processorResponseCode: tx.processorResponseCode ?? null,
          processorResponseText: tx.processorResponseText ?? null,
          createdAt: tx.createdAt,
          updatedAt: tx.updatedAt,
          merchantAccountId: tx.merchantAccountId,
        },
        { status: 200 }
      );
    } catch {
      // Not a transaction ID; attempt dispute lookup
    }

    const dispute = await gateway.dispute.find(id);
    return NextResponse.json(
      {
        source: "braintree_sandbox_live",
        recordType: "dispute",
        id: dispute.id,
        status: dispute.status,
        amount: dispute.amountDisputed ?? dispute.amountWon ?? null,
        currencyIsoCode: dispute.currencyIsoCode ?? "USD",
        type: dispute.kind ?? "chargeback",
        paymentInstrumentType: dispute.transaction?.paymentInstrumentSubtype ?? null,
        processorResponseCode: dispute.reasonCode ?? null,
        processorResponseText: dispute.reasonDescription ?? dispute.reason ?? null,
        createdAt: dispute.createdAt,
        updatedAt: dispute.updatedAt,
        merchantAccountId: dispute.merchantAccountId,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Braintree Sandbox lookup failed for "${id}": ${err.message}`
            : `Braintree Sandbox lookup failed for "${id}".`,
      },
      { status: 404 }
    );
  }
}

