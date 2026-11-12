"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";
import { BRAINTREE_SANDBOX_URL } from "@/lib/ui/api-client";

interface ComplianceBannerProps {
  onOpenProofModal: () => void;
}

export function ComplianceBanner({ onOpenProofModal }: ComplianceBannerProps) {
  return (
    <div
      role="region"
      aria-label="PayPal Braintree Sandbox Compliance Disclosure"
      className="sticky top-0 z-40 border-b border-emerald-500/30 bg-[#071510]/95 px-4 py-2 text-xs text-emerald-100 backdrop-blur"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>
            COMPLIANCE DISCLOSURE: Built on PayPal Braintree Sandbox (PayPal,
            Venmo &amp; Dispute APIs per Official Rules Sec. 4)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenProofModal}
            className="rounded border border-emerald-400/50 bg-emerald-950/70 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-900"
          >
            View Discord Organizer Approval Proof
          </button>
          <a
            href={BRAINTREE_SANDBOX_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-300 underline decoration-sky-500/50 hover:text-sky-200"
          >
            Braintree Sandbox Control Panel
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

