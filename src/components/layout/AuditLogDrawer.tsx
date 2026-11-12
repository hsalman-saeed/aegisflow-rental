"use client";

import { useEffect } from "react";
import { ScrollText, X } from "lucide-react";
import type { EventLogEntry } from "@/types/domain";

interface AuditLogDrawerProps {
  open: boolean;
  entries: EventLogEntry[];
  onClose: () => void;
}

export function AuditLogDrawer({ open, entries, onClose }: AuditLogDrawerProps) {
  useEffect(() => {
    if (!open) return;
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
      aria-label="Per-Session Audit Log"
      className="fixed inset-0 z-50 flex justify-end bg-black/65"
    >
      <div className="flex h-full w-full max-w-lg flex-col border-l border-gray-700 bg-[#0D1320] shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-sky-400" />
            <h2 className="text-sm font-semibold text-white">
              Immutable Session Event Log ({entries.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Audit Log"
            className="rounded-lg border border-gray-700 p-1.5 text-gray-300 hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border border-gray-800 bg-[#111827] p-3 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-semibold text-sky-300">
                  {entry.action}
                </span>
                <span className="rounded bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-gray-200">
                  Role: {entry.actorRole}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                <span>
                  {entry.entityType} · <span className="font-mono">{entry.entityId}</span>
                </span>
                <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
              </div>
              <pre className="mt-2 overflow-x-auto rounded bg-[#090D16] p-2 font-mono text-[10px] text-gray-300">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

