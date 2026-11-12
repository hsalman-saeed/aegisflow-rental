import { NextRequest } from "next/server";
import {
  jsonError,
  jsonWithSession,
  resolveSessionContext,
} from "@/lib/api/session-http";
import { appendEventLog, saveSession } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    itemId?: string;
    bookingId?: string;
    channel3ProductTitle?: string;
    channel3RetailUrl?: string;
    priceCents?: number;
    priceSource?: "channel3" | "manual_source";
  };

  if (
    !body.itemId ||
    !body.channel3RetailUrl ||
    typeof body.priceCents !== "number" ||
    !Number.isInteger(body.priceCents) ||
    body.priceCents <= 0
  ) {
    return jsonError(
      "Requires itemId, valid retail URL, and positive integer priceCents.",
      400
    );
  }

  const ctx = await resolveSessionContext(req);
  const retrievedAt = new Date().toISOString();
  let matchedItemId: string | null = null;
  let updatedItemRef = null as unknown;

  const updatedInspections = ctx.data.inspections.map((insp) => {
    if (body.bookingId && insp.bookingId !== body.bookingId) return insp;
    return {
      ...insp,
      items: insp.items.map((item) => {
        if (item.id !== body.itemId) return item;
        matchedItemId = item.id;
        const locked = {
          ...item,
          channel3ProductTitle:
            body.channel3ProductTitle?.trim() || item.itemName,
          channel3PriceCents: body.priceCents,
          channel3RetailUrl: body.channel3RetailUrl,
          channel3RetrievedAt: retrievedAt,
          priceSource: body.priceSource ?? "channel3",
        };
        updatedItemRef = locked;
        return locked;
      }),
    };
  });

  if (!matchedItemId) {
    return jsonError(`Inspection item ${body.itemId} not found.`, 404);
  }

  let next = await saveSession(ctx.sessionId, {
    ...ctx.data,
    inspections: updatedInspections,
  });
  next = await appendEventLog(
    ctx.sessionId,
    {
      actorRole: "Yard Manager",
      action: "PRICE_PROOF_LOCKED",
      entityType: "inspection",
      entityId: matchedItemId,
      metadata: {
        priceCents: body.priceCents,
        retailUrl: body.channel3RetailUrl,
        priceSource: body.priceSource ?? "channel3",
      },
    },
    next
  );

  return jsonWithSession({ item: updatedItemRef, data: next }, ctx);
}

