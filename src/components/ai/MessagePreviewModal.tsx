import { useEffect, useState } from "react";
import { X, Send, Users, MessageSquare, Loader2, AlertTriangle } from "lucide-react";

interface MessagePreviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  campaignName: string;
  targetGroup: string;
  message: string;
  estimatedCount?: number;
  loading?: boolean;
}

const SEGMENT_LABELS: Record<string, string> = {
  all: "All Customers",
  premium: "Premium Customers (5+ visits)",
  inactive: "Inactive Customers (0 purchases)",
};

function getSegmentLabel(tg: string) {
  if (SEGMENT_LABELS[tg]) return SEGMENT_LABELS[tg];
  if (tg.startsWith("city:")) return `Customers in ${tg.split(":")[1]}`;
  if (tg.startsWith("spend_above:")) return `Customers spending above ₹${Number(tg.split(":")[1]).toLocaleString("en-IN")}`;
  return tg;
}

export function MessagePreviewModal({
  open,
  onClose,
  onConfirm,
  campaignName,
  targetGroup,
  message,
  estimatedCount,
  loading = false,
}: MessagePreviewModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-navy/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 z-[70] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-3xl shadow-2xl overflow-hidden"
        style={{
          background: "oklch(0.969 0.012 85)",
          border: "1px solid oklch(0.745 0.142 78 / 0.3)",
          boxShadow: "0 32px 80px -12px rgba(7,27,59,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{
            background: "linear-gradient(135deg, oklch(0.224 0.062 263), oklch(0.18 0.07 263))",
          }}
        >
          <div>
            <div className="font-serif text-base font-semibold" style={{ color: "oklch(0.97 0.01 85)" }}>
              📋 Campaign Preview
            </div>
            <div className="text-[11px]" style={{ color: "oklch(0.82 0.13 82)" }}>
              Review before sending
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-xl hover:bg-white/10 transition"
            style={{ color: "oklch(0.75 0.02 85)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Warning */}
          <div
            className="flex items-start gap-3 rounded-2xl p-3.5"
            style={{
              background: "oklch(0.78 0.15 70 / 0.1)",
              border: "1px solid oklch(0.78 0.15 70 / 0.3)",
            }}
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "oklch(0.55 0.12 70)" }} />
            <p className="text-xs" style={{ color: "oklch(0.45 0.05 263)" }}>
              This will send real WhatsApp messages to customers. Please review before confirming.
            </p>
          </div>

          {/* Campaign name */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
              Campaign Name
            </div>
            <div
              className="rounded-xl px-3.5 py-2.5 text-sm font-medium"
              style={{ background: "white", border: "1px solid oklch(0.9 0.012 85)", color: "oklch(0.224 0.062 263)" }}
            >
              {campaignName || "—"}
            </div>
          </div>

          {/* Target group */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
              Target Group
            </div>
            <div
              className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
              style={{ background: "white", border: "1px solid oklch(0.9 0.012 85)" }}
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" style={{ color: "oklch(0.745 0.142 78)" }} />
                <span className="text-sm" style={{ color: "oklch(0.224 0.062 263)" }}>
                  {getSegmentLabel(targetGroup)}
                </span>
              </div>
              {estimatedCount !== undefined && (
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                  style={{
                    background: "oklch(0.745 0.142 78 / 0.15)",
                    color: "oklch(0.45 0.08 78)",
                  }}
                >
                  ~{estimatedCount} customers
                </span>
              )}
            </div>
          </div>

          {/* Message */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
              Message Content
            </div>
            <div
              className="rounded-xl px-3.5 py-3 text-sm leading-relaxed max-h-36 overflow-y-auto"
              style={{
                background: "white",
                border: "1px solid oklch(0.9 0.012 85)",
                color: "oklch(0.35 0.05 263)",
                fontFamily: "monospace",
                fontSize: "0.8rem",
              }}
            >
              <MessageSquare className="inline h-3.5 w-3.5 mr-2 -mt-0.5 text-green-500" />
              {message || "No message entered"}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div
          className="flex gap-3 px-6 py-4"
          style={{ borderTop: "1px solid oklch(0.9 0.012 85)" }}
        >
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl py-2.5 text-sm font-medium transition hover:opacity-80"
            style={{
              background: "oklch(0.9 0.012 85)",
              color: "oklch(0.45 0.03 263)",
              border: "1px solid oklch(0.85 0.012 85)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, oklch(0.224 0.062 263), oklch(0.18 0.07 263))",
              color: "oklch(0.82 0.13 82)",
            }}
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
            ) : (
              <><Send className="h-4 w-4" /> Send Now</>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
