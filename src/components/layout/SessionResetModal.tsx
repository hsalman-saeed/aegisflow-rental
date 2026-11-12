"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, RotateCcw, X } from "lucide-react";

interface SessionResetModalProps {
  open: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function SessionResetModal({
  open,
  busy,
  onConfirm,
  onClose,
}: SessionResetModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-amber-500/40 bg-[#111827] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <h2 id="reset-modal-title" className="text-base font-semibold text-white">
              Reset Your Demo Session?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close Reset Modal"
            className="rounded-lg border border-gray-700 p-1 text-gray-400 hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-gray-300">
          Restores your isolated <span className="font-mono text-sky-300">af_session_id</span>{" "}
          6-table workspace back to the clean <strong>Northside AV &amp; Cinema Rentals</strong>{" "}
          starting state (<span className="font-mono">BK-9021</span> pending authorization,{" "}
          <span className="font-mono">BK-9024</span> confirmed on Unit #1). Previously created
          Braintree Sandbox transactions remain viewable in{" "}
          <span className="font-mono">sandbox.braintreegateway.com</span>.
        </p>

        <div className="mt-5 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-gray-700 px-3.5 py-2 text-xs font-medium text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {busy ? "Resetting..." : "Confirm Session Reset"}
          </button>
        </div>
      </div>
    </div>
  );
}

