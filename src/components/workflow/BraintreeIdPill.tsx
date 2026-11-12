"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";
import { BRAINTREE_SANDBOX_URL } from "@/lib/ui/api-client";

interface BraintreeVerifyPayload {
  source: "braintree_sandbox_live" | "seed_fixture";
  recordType?: "transaction" | "dispute";
  id: string;
  note?: string;
  status?: string;
  amount?: string | null;
  currencyIsoCode?: string;
  type?: string;
  paymentInstrumentType?: string | null;
  processorResponseCode?: string | null;
  processorResponseText?: string | null;
  createdAt?: string;
  updatedAt?: string;
  merchantAccountId?: string;
  error?: string;
}

export function BraintreeInspectorModal({
  recordId,
  onClose,
}: {
  recordId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<BraintreeVerifyPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!recordId) return;
    let cancelled = false;
    setLoading(true);
    setPayload(null);
    setErrorMsg(null);

    fetch(`/api/braintree/verify/${encodeURIComponent(recordId)}`)
      .then(async (res) => {
        const json = (await res.json()) as BraintreeVerifyPayload;
        if (cancelled) return;
        if (!res.ok) {
          setErrorMsg(json.error || `HTTP ${res.status} verifying ${recordId}`);
        } else {
          setPayload(json);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(
            err instanceof Error ? err.message : "Network error verifying record."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [recordId]);

  if (!recordId) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recordId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live PayPal Braintree Sandbox Gateway Inspector"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-gray-700 bg-[#0D1320] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-semibold text-white">
                Live PayPal Braintree Sandbox Gateway Inspector
              </h3>
              <p className="font-mono text-[11px] text-gray-400">
                Record ID: {recordId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Gateway Inspector"
            className="rounded-lg border border-gray-700 p-1 text-gray-300 hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-sky-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Querying sandbox.braintreegateway.com live API...
            </div>
          ) : errorMsg ? (
            <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-200">
              {errorMsg}
            </div>
          ) : payload?.source === "seed_fixture" ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-4 text-xs text-amber-100">
              <p className="font-semibold text-amber-300">
                Seeded Baseline Fixture ({payload.id})
              </p>
              <p className="mt-1 text-gray-300">{payload.note}</p>
            </div>
          ) : payload ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  LIVE VERIFIED VIA BRAINTREE SANDBOX GATEWAY API
                </span>
                <span className="rounded bg-emerald-900/60 px-2 py-0.5 font-mono text-[11px] uppercase text-emerald-100">
                  {payload.recordType} &middot; {payload.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-gray-800 bg-[#090D16] p-3 text-xs sm:grid-cols-3">
                <div>
                  <span className="text-[10px] uppercase text-gray-500">Amount</span>
                  <p className="font-mono font-semibold text-white">
                    {payload.amount ? `$${payload.amount} ${payload.currencyIsoCode ?? "USD"}` : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-gray-500">Type / Instrument</span>
                  <p className="font-mono text-gray-200">
                    {payload.type ?? "—"} / {payload.paymentInstrumentType ?? "—"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-gray-500">Processor Response</span>
                  <p className="font-mono text-gray-200">
                    {payload.processorResponseCode ?? "—"} {payload.processorResponseText ?? ""}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-gray-500">Merchant Account</span>
                  <p className="font-mono text-gray-300">{payload.merchantAccountId ?? "—"}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] uppercase text-gray-500">Created At</span>
                  <p className="font-mono text-gray-300">{payload.createdAt ?? "—"}</p>
                </div>
              </div>

              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Sanitized Gateway JSON Response
                </p>
                <pre className="max-h-48 overflow-auto rounded-lg border border-gray-800 bg-[#090D16] p-3 font-mono text-[11px] text-sky-200">
                  {JSON.stringify(payload, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-800 pt-3">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-[#111827] px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied ID" : "Copy ID"}
          </button>

          <div className="flex items-center gap-2">
            <a
              href={BRAINTREE_SANDBOX_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-[#111827] px-3 py-1.5 text-xs text-sky-300 hover:bg-gray-800"
            >
              Open Braintree Merchant Control Panel
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface BraintreeIdPillProps {
  label: string;
  idValue: string;
}

export function BraintreeIdPill({ label, idValue }: BraintreeIdPillProps) {
  const [copied, setCopied] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(idValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable in restricted context
    }
  };

  if (idValue.startsWith("bt_seed_")) {
    return (
      <div className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-gray-700 bg-[#090D16] px-2.5 py-1 text-[11px]">
        <span className="text-gray-400">{label}:</span>
        <span className="rounded bg-emerald-950/50 px-1.5 py-0.5 font-medium text-emerald-300">
          Seed Fixture
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-gray-700 bg-[#090D16] px-2.5 py-1 text-[11px]">
        <span className="text-gray-400">{label}:</span>
        <span className="font-mono font-semibold text-emerald-300">{idValue}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${label}`}
          className="inline-flex items-center gap-1 rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-800"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setInspectorOpen(true)}
          className="inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-950/40 px-2 py-0.5 text-[10px] font-semibold text-sky-300 hover:bg-sky-900/50"
        >
          <ShieldCheck className="h-3 w-3" />
          Verify Live
        </button>
      </div>
      {inspectorOpen && (
        <BraintreeInspectorModal
          recordId={idValue}
          onClose={() => setInspectorOpen(false)}
        />
      )}
    </>
  );
}
