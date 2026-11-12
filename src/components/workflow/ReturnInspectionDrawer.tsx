"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { postApiJson } from "@/lib/ui/api-client";
import type { InspectionItem, SessionData } from "@/types/domain";

interface ReturnInspectionDrawerProps {
  session: SessionData;
  bookingId: string;
  onSessionUpdate: (data: SessionData) => void;
  onAdvanceStep: () => void;
}

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export function ReturnInspectionDrawer({
  session,
  bookingId,
  onSessionUpdate,
  onAdvanceStep,
}: ReturnInspectionDrawerProps) {
  const inspection =
    session.inspections.find((i) => i.bookingId === bookingId) ??
    session.inspections[0];

  const [returnNotes, setReturnNotes] = useState(
    "Check-in notes: SanDisk SDXC card slot B empty (missing); Rode NTG5 Shotgun Microphone shock mount snapped & XLR capsule dented (damaged — needs 48h maintenance)."
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<{
    analyzed: boolean;
    aiAvailable: boolean;
    aiSource: string;
    latencyMs?: number;
  } | null>(null);
  const [inspectorChecked, setInspectorChecked] = useState(
    Boolean(inspection?.inspectorVerified)
  );
  const [editableItems, setEditableItems] = useState<InspectionItem[]>(
    inspection?.items ?? []
  );
  const [busy, setBusy] = useState<"analyze" | "confirm" | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!inspection) return null;

  const currentItems =
    editableItems.length === inspection.items.length
      ? editableItems
      : inspection.items;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_MIME.has(file.type)) {
      setUploadError(
        `Rejected "${file.name}": only JPEG, PNG, or WebP kit photos are permitted (AC-021-1).`
      );
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadError(
        `Rejected "${file.name}": exceeds 4 MB photo upload limit.`
      );
      return;
    }
    setUploadedFileName(`${file.name} (${Math.round(file.size / 1024)} KB)`);
  };

  const handleAnalyze = async () => {
    setBusy("analyze");
    setStatusMessage(null);
    try {
      const res = await postApiJson<{
        inspection?: { items: InspectionItem[] };
        modelUsed?: string;
        aiSource?: string;
        aiAvailable?: boolean;
        latencyMs?: number;
        error?: string;
        data?: SessionData;
      }>("/api/inspection/analyze", {
        bookingId: inspection.bookingId,
        returnNotes,
      });

      if (res.data.data) onSessionUpdate(res.data.data);
      if (res.data.inspection) {
        const normalizedItems = res.data.inspection.items.map((it) => ({
          ...it,
          needsMaintenance: it.type === "damaged" ? true : it.needsMaintenance,
        }));
        setEditableItems(normalizedItems);
        const damagedCount = normalizedItems.filter((i) => i.type === "damaged").length;
        const missingCount = normalizedItems.filter((i) => i.type === "missing").length;
        const totalFlagged = damagedCount + missingCount;
        if (totalFlagged > 0) {
          setStatusMessage(
            `Amazon Nova Pro Analysis Complete: ${totalFlagged} Discrepancies Flagged (${damagedCount} Damaged · 48h Maintenance Checked, ${missingCount} Missing). Review below and click 'Inspector Sign-Off & Lock Findings'.`
          );
        }
      }
      setAiStatus({
        analyzed: true,
        aiAvailable: Boolean(res.data.aiAvailable),
        aiSource: res.data.aiSource ?? res.data.modelUsed ?? "unknown",
        latencyMs: res.data.latencyMs,
      });
    } finally {
      setBusy(null);
    }
  };

  const handleItemUpdate = (
    id: string,
    patch: Partial<InspectionItem>
  ) => {
    setEditableItems((prev) =>
      (prev.length > 0 ? prev : inspection.items).map((it) =>
        it.id === id ? { ...it, ...patch } : it
      )
    );
  };

  const handleConfirmSignOff = async () => {
    if (!inspectorChecked) return;
    setBusy("confirm");
    setStatusMessage(null);
    try {
      const res = await postApiJson<{
        error?: string;
        data?: SessionData;
      }>("/api/inspection/confirm", {
        bookingId: inspection.bookingId,
        confirmedItems: currentItems.map((it) => ({
          id: it.id,
          type: it.type,
          evidenceNotes: it.evidenceNotes,
          needsMaintenance: it.needsMaintenance,
        })),
      });
      if (res.ok && res.data.data) {
        onSessionUpdate(res.data.data);
        setStatusMessage(
          "Inspector sign-off locked with immutable timestamp. Ready for Step 3 Channel3 Price Proof."
        );
      } else {
        setStatusMessage(res.data.error || "Failed to confirm inspection.");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-label="Step 2: Multimodal Return Inspection"
      className="rounded-xl border border-gray-800 bg-[#111827] p-5 shadow-lg"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-violet-600/20 px-2 py-0.5 text-[11px] font-semibold text-violet-300 ring-1 ring-violet-500/40">
              Step 2 · Post-Rental Return Inspection &amp; AI Discrepancy Check
            </span>
            <span className="rounded bg-gray-800 px-2 py-0.5 text-[11px] font-medium text-gray-300">
              Role: Return Inspector
            </span>
          </div>
          <h2 className="mt-1.5 text-base font-semibold text-white">
            Side-by-Side Handover vs. Return Inspection (`BK-9021`)
          </h2>
        </div>

        {aiStatus?.analyzed && (
          <div>
            {aiStatus.aiAvailable ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/50 bg-violet-950/60 px-3 py-1 text-[11px] font-semibold text-violet-200">
                <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                [AI suggestion — verify] · {aiStatus.aiSource} ({aiStatus.latencyMs}ms)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-950/60 px-3 py-1 text-[11px] font-semibold text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                [AI analysis unavailable — continue with manual inspection]
              </span>
            )}
          </div>
        )}
      </div>

      {/* Original SVG Visual Evidence Comparison Cards (PRD-AUD-08 safe) */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/30 bg-[#090D16] p-3.5">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-300">
            <span className="inline-flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5" />
              Pre-Rental Handover Record (Nov 11)
            </span>
            <span>4/4 Items Verified</span>
          </div>
          <svg
            viewBox="0 0 360 96"
            className="mt-2.5 w-full rounded border border-gray-800 bg-[#0D1320]"
            role="img"
            aria-label="Handover Pelican case diagram with all bays filled"
          >
            <rect x="12" y="14" width="110" height="68" rx="6" fill="#064E3B" stroke="#10B981" />
            <text x="67" y="52" textAnchor="middle" fill="#ECFDF5" fontSize="11">FX6 Body + Lens</text>
            <rect x="134" y="14" width="110" height="68" rx="6" fill="#064E3B" stroke="#10B981" />
            <text x="189" y="52" textAnchor="middle" fill="#ECFDF5" fontSize="11">Rode NTG5 Intact</text>
            <rect x="256" y="14" width="92" height="68" rx="6" fill="#064E3B" stroke="#10B981" />
            <text x="302" y="52" textAnchor="middle" fill="#ECFDF5" fontSize="11">2x SDXC Cards</text>
          </svg>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-[#090D16] p-3.5">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
            <span className="inline-flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5" />
              Post-Rental Return Check-In (Nov 13)
            </span>
            <span>Discrepancies Flagged Below</span>
          </div>
          <svg
            viewBox="0 0 360 96"
            className="mt-2.5 w-full rounded border border-gray-800 bg-[#0D1320]"
            role="img"
            aria-label="Return Pelican case diagram showing damaged mic and missing SDXC card"
          >
            <rect x="12" y="14" width="110" height="68" rx="6" fill="#064E3B" stroke="#10B981" />
            <text x="67" y="52" textAnchor="middle" fill="#ECFDF5" fontSize="11">FX6 + Lens OK</text>
            <rect x="134" y="14" width="110" height="68" rx="6" fill="#7F1D1D" stroke="#EF4444" />
            <text x="189" y="45" textAnchor="middle" fill="#FEF2F2" fontSize="11">NTG5 Mount</text>
            <text x="189" y="61" textAnchor="middle" fill="#FCA5A5" fontSize="10">DAMAGED</text>
            <rect x="256" y="14" width="92" height="68" rx="6" fill="#78350F" stroke="#F59E0B" strokeDasharray="4 3" />
            <text x="302" y="45" textAnchor="middle" fill="#FFFBEB" fontSize="11">Slot B Empty</text>
            <text x="302" y="61" textAnchor="middle" fill="#FCD34D" fontSize="10">MISSING</text>
          </svg>
        </div>
      </div>

      {/* Return Notes & Photo Upload */}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-300">
            Return Check-In Notes &amp; Technician Observations
          </label>
          <textarea
            rows={2}
            value={returnNotes}
            onChange={(e) => setReturnNotes(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-gray-700 bg-[#090D16] p-2.5 text-xs text-gray-100"
          />
        </div>

        <div className="flex flex-col justify-between rounded-lg border border-gray-800 bg-[#090D16] p-3">
          <label className="block text-xs font-medium text-gray-300">
            Optional Kit Photo (JPEG/PNG/WebP &le; 4 MB)
          </label>
          <label className="mt-1.5 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded border border-dashed border-gray-600 px-3 py-2 text-xs text-gray-300 hover:border-blue-500">
            <Upload className="h-3.5 w-3.5" />
            {uploadedFileName ?? "Attach Return Photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </label>
          {uploadError && (
            <p className="mt-1 text-[11px] text-red-400">{uploadError}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {busy === "analyze"
            ? "Analyzing with Amazon Nova..."
            : "Run Multimodal Discrepancy Analysis (Amazon Nova Pro)"}
        </button>
      </div>

      {/* Checklist Rows */}
      <div className="mt-4 space-y-2.5">
        {currentItems.map((item) => (
          <div
            key={item.id}
            className={`grid items-center gap-3 rounded-lg border p-3 text-xs md:grid-cols-12 ${
              item.type === "ok"
                ? "border-gray-800 bg-[#090D16]/70"
                : "border-amber-500/40 bg-amber-950/15"
            }`}
          >
            <div className="md:col-span-3">
              <div className="font-semibold text-white">{item.itemName}</div>
              <div className="font-mono text-[10px] text-gray-400">
                SKU:{" "}
                {item.id === "item_fx6_body"
                  ? "SONY-FX6-BODY"
                  : item.id === "item_24_70_gm"
                    ? "SEL2470GM2"
                    : item.id === "item_ntg5_mic"
                      ? "RODE-NTG5-KIT"
                      : item.id === "item_sdxc"
                        ? "SDSDXDK-128G"
                        : item.id.toUpperCase()}
              </div>
              {item.type === "damaged" && (
                <span className="mt-1 inline-block rounded border border-rose-500/40 bg-rose-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200">
                  AI Flagged: Damaged &middot; 48h Bench Repair Required
                </span>
              )}
              {item.type === "missing" && (
                <span className="mt-1 inline-block rounded border border-amber-500/40 bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                  AI Flagged: Missing from Slot B
                </span>
              )}
            </div>
            <div className="md:col-span-2">
              <select
                value={item.type}
                aria-label={`Condition for ${item.itemName}`}
                onChange={(e) =>
                  handleItemUpdate(item.id, {
                    type: e.target.value as InspectionItem["type"],
                  })
                }
                className="w-full rounded border border-gray-700 bg-[#111827] px-2 py-1 text-xs text-white"
              >
                <option value="ok">OK</option>
                <option value="missing">MISSING</option>
                <option value="damaged">DAMAGED</option>
              </select>
            </div>
            <div className="md:col-span-5">
              <input
                type="text"
                value={item.evidenceNotes}
                onChange={(e) =>
                  handleItemUpdate(item.id, { evidenceNotes: e.target.value })
                }
                className="w-full rounded border border-gray-700 bg-[#111827] px-2 py-1 text-xs text-gray-200"
              />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-300 md:col-span-2">
              <input
                type="checkbox"
                checked={item.needsMaintenance}
                onChange={(e) =>
                  handleItemUpdate(item.id, {
                    needsMaintenance: e.target.checked,
                  })
                }
                className="accent-rose-500"
              />
              48h Maint
            </label>
          </div>
        ))}
      </div>

      {/* Mandatory Human Sign-Off */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 pt-4">
        <label className="flex items-center gap-2 text-xs text-gray-200">
          <input
            type="checkbox"
            checked={inspectorChecked}
            onChange={(e) => setInspectorChecked(e.target.checked)}
            className="h-4 w-4 accent-emerald-500"
          />
          I verify these physical return inspection findings as Yard Return Inspector
        </label>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleConfirmSignOff}
            disabled={!inspectorChecked || busy !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ClipboardCheck className="h-4 w-4" />
            {busy === "confirm"
              ? "Locking Sign-Off..."
              : "Inspector Sign-Off & Lock Findings"}
          </button>

          {inspection.inspectorVerified && (
            <button
              type="button"
              onClick={onAdvanceStep}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-950/40 px-3.5 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-900/50"
            >
              Advance to Step 3: Channel3 Price Proof
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}
    </section>
  );
}

