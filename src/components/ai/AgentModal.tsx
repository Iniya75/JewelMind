import { useState, useEffect, useRef } from "react";
import { X, MessageSquare, Mic, Clock } from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { VoiceButton } from "./VoiceButton";
import { ConversationHistory } from "./ConversationHistory";

type Tab = "chat" | "voice";

interface AgentModalProps {
  open: boolean;
  onClose: () => void;
}

export function AgentModal({ open, onClose }: AgentModalProps) {
  const [tab, setTab] = useState<Tab>("chat");
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);



  if (!open) return null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "chat",    label: "Chat",    icon: <MessageSquare className="h-3.5 w-3.5" /> },
    { id: "voice",   label: "Voice",   icon: <Mic className="h-3.5 w-3.5" /> },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-40 bg-navy/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Panel */}
      <div
        className="fixed bottom-24 right-6 z-50 flex flex-col rounded-3xl shadow-2xl overflow-hidden"
        style={{
          width: "min(420px, calc(100vw - 24px))",
          height: "min(640px, calc(100vh - 120px))",
          background: "oklch(0.969 0.012 85)",
          border: "1px solid oklch(0.745 0.142 78 / 0.3)",
          boxShadow: "0 32px 80px -12px rgba(7,27,59,0.35), 0 0 0 1px rgba(212,160,23,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, oklch(0.224 0.062 263), oklch(0.18 0.07 263))",
            borderBottom: "1px solid oklch(0.745 0.142 78 / 0.2)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl shadow-inner"
              style={{ background: "linear-gradient(135deg, oklch(0.82 0.13 82), oklch(0.68 0.15 70))" }}
            >
              <span className="text-base leading-none">💎</span>
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: "oklch(0.97 0.01 85)" }}>
                JewelMind AI
              </div>
              <div className="text-[10px] flex items-center gap-1" style={{ color: "oklch(0.82 0.13 82)" }}>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                Always ready
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-xl transition hover:bg-white/10"
            style={{ color: "oklch(0.75 0.02 85)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-1 px-4 py-2.5 flex-shrink-0"
          style={{ borderBottom: "1px solid oklch(0.9 0.012 85)" }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-medium transition-all"
              style={{
                background: tab === t.id
                  ? "linear-gradient(135deg, oklch(0.224 0.062 263), oklch(0.18 0.07 263))"
                  : "transparent",
                color: tab === t.id ? "oklch(0.82 0.13 82)" : "oklch(0.45 0.03 263)",
                border: tab === t.id ? "1px solid oklch(0.745 0.142 78 / 0.3)" : "1px solid transparent",
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {tab === "chat" && (
            <ChatPanel onConversationSaved={() => {}} />
          )}
          {tab === "voice" && (
            <VoiceButton />
          )}
        </div>
      </div>
    </>
  );
}
