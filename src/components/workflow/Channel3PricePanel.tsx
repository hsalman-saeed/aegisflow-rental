"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Lock,
  Search,
  Tag,
} from "lucide-react";
import { formatUsdCents, postApiJson } from "@/lib/ui/api-client";
import type { SessionData } from "@/types/domain";

interface Channel3Candidate {
  productId: string;
  title: string;
  merchantDomain: string;
  priceCents: number;
  retailUrl: string;
  retrievedAt: string;
}

interface Channel3PricePanelProps {
  session: SessionData;
  bookingId: string;
  onSessionUpdate: (data: SessionData) => void;
  onAdvanceStep: () => void;
}

export function Channel3PricePanel({
  session,
  bookingId,
  onSessionUpdate,
  onAdvanceStep,
}: Channel3PricePanelProps) {
  const inspection =
    session.inspections.find((i) => i.bookingId === bookingId) ??
    session.inspections[0];
  const discrepancyItems =
    inspection?.items.filter((i) => i.type !== "ok") ?? [];

  const [candidatesByItem, setCandidatesByItem] = useState<
    Record<string, Channel3Candidate[]>
  >({});
  const [manualPriceUsd, setManualPriceUsd] = useState<Record<string, string>>({});
  const [manualUrl, setManualUrl] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const autoFetchedKeyRef = useRef<string>("");

  const handleFetchChannel3 = useCallback(async () => {
    if (!inspection || discrepancyItems.length === 0) return;
    setBusyKey("fetch");
    setBanner(null);
    try {
      const queries = discrepancyItems.map((i) => i.itemName);
      const res = await postApiJson<{
        results?: Array<{
          query: string;
          cached: boolean;
          candidates: Channel3Candidate[];
        }>;
      }>("/api/channel3/price-check", { queries });

      const nextMap: Record<string, Channel3Candidate[]> = {};
      discrepancyItems.forEach((item, idx) => {
        nextMap[item.id] = res.data.results?.[idx]?.candidates ?? [];
      });
      setCandidatesByItem(nextMap);
      setBanner(
        "Fetched live retail replacement offers from Channel3 Product Catalog API."
      );
    } finally {
      setBusyKey(null);
    }
  }, [discrepancyItems, inspection]);

  const discrepancySignature = discrepancyItems.map((i) => i.id).join("|");
  useEffect(() => {
    if (!inspection || discrepancyItems.length === 0) return;
    const anyMissingCandidates = discrepancyItems.some(
      (i) => (candidatesByItem[i.id]?.length ?? 0) === 0
    );
    if (
      anyMissingCandidates &&
      autoFetchedKeyRef.current !== discrepancySignature
    ) {
      autoFetchedKeyRef.current = discrepancySignature;
      void handleFetchChannel3();
    }
  }, [
    candidatesByItem,
    discrepancyItems,
    discrepancySignature,
    handleFetchChannel3,
    inspection,
  ]);

  if (!inspection) return null;

  const handleLockPrice = async (params: {
    itemId: string;
    title: string;
    url: string;
    priceCents: number;
    priceSource: "channel3" | "manual_source";
  }) => {
    setBusyKey(params.itemId);
    try {
      const res = await postApiJson<{ data?: SessionData; error?: string }>(
        "/api/channel3/lock-price",
        {
          bookingId: inspection.bookingId,
          itemId: params.itemId,
          channel3ProductTitle: params.title,
          channel3RetailUrl: params.url,
          priceCents: params.priceCents,
          priceSource: params.priceSource,
        }
      );
      if (res.ok && res.data.data) {
        onSessionUpdate(res.data.data);
      } else {
        setBanner(res.data.error || "Unable to lock retail price.");
      }
    } finally {
      setBusyKey(null);
    }
  };

  const allLocked =
    discrepancyItems.length > 0 &&
    discrepancyItems.every(
      (it) => Boolean(it.channel3PriceCents && it.channel3RetailUrl)
    );

  return (
    <section
      aria-label="Step 3: Channel3 Retail Price Proof"
      className="rounded-xl border border-gray-800 bg-[#111827] p-5 shadow-lg"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-blue-600/20 px-2 py-0.5 text-[11px] font-semibold text-blue-300 ring-1 ring-blue-500/40">
              Step 3 · Live Retail Replacement Valuation
            </span>
            <span className="rounded bg-gray-800 px-2 py-0.5 text-[11px] font-medium text-sky-300">
              Live catalog lookup via Channel3 Product API
            </span>
          </div>
          <h2 className="mt-1.5 text-base font-semibold text-white">
            Lock Verified Third-Party Retail Replacement Prices
          </h2>
        </div>

        <button
          type="button"
          onClick={handleFetchChannel3}
          disabled={busyKey !== null || discrepancyItems.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          <Search className="h-4 w-4" />
          {busyKey === "fetch"
            ? "Querying Channel3 API..."
            : "Fetch Live Retail Replacement Prices via Channel3"}
        </button>
      </div>

      {discrepancyItems.length === 0 ? (
        <p className="mt-4 text-xs text-amber-300">
          Complete Step 2 (Analyze &amp; Inspector Sign-Off) first to surface discrepancy items.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {discrepancyItems.map((item) => {
            const candidates = candidatesByItem[item.id] ?? [];
            const topCandidate = candidates[0];
            const isLocked = Boolean(
              item.channel3PriceCents && item.channel3RetailUrl
            );

            return (
              <div
                key={item.id}
                className="flex flex-col justify-between rounded-lg border border-gray-800 bg-[#090D16] p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">
                      {item.itemName}
                    </span>
                    <span className="rounded bg-amber-950 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-300">
                      {item.type}
                    </span>
                  </div>

                  {isLocked && (
                    <div className="mt-2.5 rounded border border-emerald-500/40 bg-emerald-950/30 p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
                          <Lock className="h-3.5 w-3.5" />
                          Locked: {formatUsdCents(item.channel3PriceCents!)}
                        </span>
                        <a
                          href={item.channel3RetailUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-sky-300 underline"
                        >
                          Merchant Proof <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-gray-300">
                        {item.channel3ProductTitle}
                      </p>
                    </div>
                  )}

                  {busyKey === "fetch" && !topCandidate ? (
                    <div className="mt-3 space-y-2 rounded border border-blue-500/30 bg-[#111827]/70 p-3">
                      <p className="text-xs font-medium text-sky-300">
                        Querying Channel3 Live Retail Catalog for {discrepancyItems.length} discrepancy item{discrepancyItems.length === 1 ? "" : "s"}...
                      </p>
                      <div className="h-10 animate-pulse rounded bg-gray-800/80" />
                    </div>
                  ) : topCandidate ? (
                    <div className="mt-3 space-y-2">
                      {candidates.slice(0, 2).map((cand) => (
                        <div
                          key={cand.productId + cand.retailUrl}
                          className="flex items-center justify-between gap-2 rounded border border-gray-800 bg-[#111827] p-2.5 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-100">
                              {cand.title}
                            </p>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                              <span className="rounded bg-gray-800 px-1.5 py-0.5 text-sky-300">
                                {cand.merchantDomain}
                              </span>
                              <span className="font-mono font-bold text-white">
                                {formatUsdCents(cand.priceCents)}
                              </span>
                              <a
                                href={cand.retailUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-sky-400 underline"
                              >
                                Link <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleLockPrice({
                                itemId: item.id,
                                title: cand.title,
                                url: cand.retailUrl,
                                priceCents: cand.priceCents,
                                priceSource: "channel3",
                              })
                            }
                            disabled={busyKey !== null}
                            className="shrink-0 rounded bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            Lock This Retail Price Proof
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <details className="mt-3 rounded border border-gray-800/80 bg-[#111827]/50 p-2.5 text-xs">
                    <summary className="cursor-pointer select-none text-[11px] font-medium text-gray-400 hover:text-gray-200">
                      Enter manual replacement price &amp; URL instead
                    </summary>
                    <div className="mt-2.5 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="USD e.g. 53.80"
                          value={manualPriceUsd[item.id] ?? ""}
                          onChange={(e) =>
                            setManualPriceUsd((p) => ({
                              ...p,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="rounded border border-gray-700 bg-[#090D16] px-2 py-1 text-xs text-white"
                        />
                        <input
                          type="url"
                          placeholder="https://bhphotovideo.com/..."
                          value={manualUrl[item.id] ?? ""}
                          onChange={(e) =>
                            setManualUrl((p) => ({
                              ...p,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="rounded border border-gray-700 bg-[#090D16] px-2 py-1 text-xs text-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const cents = Math.round(
                            Number(manualPriceUsd[item.id] || "0") * 100
                          );
                          if (cents > 0 && manualUrl[item.id]) {
                            void handleLockPrice({
                              itemId: item.id,
                              title: item.itemName,
                              url: manualUrl[item.id]!,
                              priceCents: cents,
                              priceSource: "manual_source",
                            });
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded border border-gray-600 px-2.5 py-1 text-[11px] text-gray-200 hover:bg-gray-800"
                      >
                        <Tag className="h-3 w-3" /> Lock Manual Price Proof
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {banner && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-950/30 p-3 text-xs text-sky-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-sky-400" />
          <span>{banner}</span>
        </div>
      )}

      {allLocked && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onAdvanceStep}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            Advance to Step 4: Deterministic $100 Policy Gate
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </section>
  );
}

