import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  jsonError,
  jsonWithSession,
  resolveSessionContext,
} from "@/lib/api/session-http";
import { analyzeReturnDiscrepanciesWithNova } from "@/lib/bedrock/client";
import { appendEventLog, saveSession } from "@/lib/store";
import type { Inspection } from "@/types/domain";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: NextRequest) {
  const ctx = await resolveSessionContext(req);
  const rateBlocked = await enforceRateLimit(req, ctx.sessionId);
  if (rateBlocked) return rateBlocked;

  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
      return jsonError("Payload exceeds 4 MB inspection upload limit.", 413);
    }
  }

  let body: {
    bookingId?: string;
    returnNotes?: string;
    damagedItemIds?: string[];
    missingItemIds?: string[];
  } = {};

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return jsonError("Invalid multipart/form-data payload.", 400);
    }
    const maybeFile = formData.get("file") ?? formData.get("photo");
    if (maybeFile instanceof File) {
      if (maybeFile.size > MAX_UPLOAD_BYTES) {
        return jsonError(
          `Uploaded file "${maybeFile.name}" exceeds 4 MB limit.`,
          413
        );
      }
      if (!ALLOWED_IMAGE_MIME.has(maybeFile.type)) {
        return jsonError(
          `Unsupported file type "${maybeFile.type}". Only JPEG, PNG, or WebP permitted.`,
          400
        );
      }
    }
    const parseIdList = (raw: FormDataEntryValue | null): string[] | undefined => {
      if (typeof raw !== "string" || !raw.trim()) return undefined;
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(String) : undefined;
      } catch {
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
      }
    };
    body = {
      bookingId: typeof formData.get("bookingId") === "string" ? String(formData.get("bookingId")) : undefined,
      returnNotes: typeof formData.get("returnNotes") === "string" ? String(formData.get("returnNotes")) : undefined,
      damagedItemIds: parseIdList(formData.get("damagedItemIds")),
      missingItemIds: parseIdList(formData.get("missingItemIds")),
    };
  } else {
    body = (await req.json().catch(() => ({}))) as typeof body;
  }

  if (!body.bookingId) {
    return jsonError("Missing bookingId.", 400);
  }

  const booking = ctx.data.bookings.find((b) => b.id === body.bookingId);
  if (!booking) {
    return jsonError(`Booking ${body.bookingId} not found.`, 404);
  }

  let inspection = ctx.data.inspections.find((i) => i.bookingId === booking.id);
  if (!inspection) {
    inspection = {
      id: `insp_${randomUUID().slice(0, 6)}`,
      bookingId: booking.id,
      assetId: booking.assetId,
      inspectorVerified: false,
      items: [],
    };
  }

  const notes =
    body.returnNotes?.trim() ||
    "Check-in notes: SanDisk SDXC card slot B empty (missing); Rode NTG5 Shotgun Microphone shock mount snapped and XLR capsule dented (damaged).";

  const analysis = await analyzeReturnDiscrepanciesWithNova({
    handoverChecklist: inspection.items,
    returnNotes: notes,
    damagedItemIds: body.damagedItemIds,
    missingItemIds: body.missingItemIds,
  });

  const candidateMap = new Map(analysis.candidates.map((c) => [c.itemId, c]));
  const updatedInspection: Inspection = {
    ...inspection,
    items: inspection.items.map((item) => {
      const match = candidateMap.get(item.id);
      return match
        ? {
            ...item,
            type: match.type,
            evidenceNotes: match.evidenceNotes,
            needsMaintenance: match.type === "damaged" ? true : match.needsMaintenance,
          }
        : item;
    }),
  };

  const nextInspections = ctx.data.inspections.some(
    (i) => i.id === updatedInspection.id
  )
    ? ctx.data.inspections.map((i) =>
        i.id === updatedInspection.id ? updatedInspection : i
      )
    : [...ctx.data.inspections, updatedInspection];

  let next = await saveSession(ctx.sessionId, {
    ...ctx.data,
    inspections: nextInspections,
  });
  next = await appendEventLog(
    ctx.sessionId,
    {
      actorRole: "System / AI",
      action: "INSPECTION_ANALYZED",
      entityType: "inspection",
      entityId: updatedInspection.id,
      metadata: {
        modelUsed: analysis.modelUsed,
        usedFallback: analysis.usedFallback,
        latencyMs: analysis.latencyMs,
      },
    },
    next
  );

  return jsonWithSession(
    {
      discrepancies: updatedInspection.items.filter((i) => i.type !== "ok"),
      inspection: updatedInspection,
      modelUsed: analysis.modelUsed,
      aiSource: analysis.aiSource,
      aiAvailable: analysis.aiAvailable,
      latencyMs: analysis.latencyMs,
      data: next,
    },
    ctx
  );
}

