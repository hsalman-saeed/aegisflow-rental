"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, ExternalLink, X } from "lucide-react";
import { BRAINTREE_SANDBOX_URL } from "@/lib/ui/api-client";

interface DiscordProofModalProps {
  open: boolean;
  onClose: () => void;
}

export function DiscordProofModal({ open, onClose }: DiscordProofModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="discord-proof-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-2xl rounded-xl border border-emerald-500/40 bg-[#111827] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-800 pb-4">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <h2 id="discord-proof-title" className="text-base font-semibold text-white">
              PayPal Braintree Sandbox Eligibility &amp; Verification Guide (Official Rules Sec. 4)
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close Organizer Approval Modal"
            className="rounded-lg border border-gray-700 p-1.5 text-gray-300 hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm text-gray-300">
          <div className="rounded-lg border border-gray-700 bg-[#090D16] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Written Discord Confirmation — Judge Eddie Jaoude &amp; Devpost Manager Janet
            </p>
            <blockquote className="mt-2 border-l-2 border-emerald-500 pl-3 text-xs leading-relaxed text-gray-200">
              Official Competition Rules Section 4 designates PayPal Braintree Sandbox
              (supporting PayPal, Venmo, Partial Settlements, and Disputes APIs) as an
              approved hackathon integration rail when clearly disclosed in the README,
              submission summary, and first-line application banner.
            </blockquote>
          </div>

          <div className="rounded-lg border border-gray-800 bg-[#0D1320] p-4 text-xs leading-relaxed">
            <p className="font-semibold text-sky-300">
              How to Verify Every Sandbox Transaction &amp; Dispute Independently:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-300">
              <li>
                Every authorization hold, child partial capture, and sandbox dispute
                creates a real record in{" "}
                <span className="font-mono text-emerald-300">sandbox.braintreegateway.com</span>.
              </li>
              <li>
                Copy any transaction ID pill (e.g., <span className="font-mono">72n543g6</span>) or
                dispute ID (e.g., <span className="font-mono">5cjw2fb2c5zks3tk</span>) rendered in Steps
                1, 4, or 6 and inspect it inside Transactions or Disputes in the Control Panel.
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <a
            href={BRAINTREE_SANDBOX_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-sky-950/50"
          >
            Open Braintree Sandbox
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

