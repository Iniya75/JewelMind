import { useState } from "react";
import { Sparkles } from "lucide-react";
import { AgentModal } from "./AgentModal";

export function FloatingAIAssistant() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setOpen(true)}
          className="group relative flex items-center gap-2.5 rounded-full px-5 py-3.5 shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(135deg, oklch(0.224 0.062 263), oklch(0.15 0.07 263))",
            border: "1px solid oklch(0.745 0.142 78 / 0.4)",
            boxShadow: "0 20px 40px -12px rgba(7, 27, 59, 0.45), 0 0 0 1px rgba(212, 160, 23, 0.25)",
          }}
          title="Open JewelMind Chatbot"
        >
          {/* Glowing pulse ring */}
          <span className="absolute -inset-0.5 rounded-full bg-[var(--gold)] opacity-30 blur animate-pulse group-hover:opacity-50 transition" />

          <div
            className="relative flex h-8 w-8 items-center justify-center rounded-full shadow-inner"
            style={{ background: "linear-gradient(135deg, oklch(0.82 0.13 82), oklch(0.68 0.15 70))" }}
          >
            <Sparkles className="h-4 w-4 text-navy animate-spin-slow" />
          </div>

          <div className="relative flex flex-col items-start pr-1">
            <div className="font-serif text-sm font-semibold tracking-wide text-white flex items-center gap-1.5">
              <span>Chatbot</span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            </div>
            <span className="text-[10px] text-[var(--gold)] font-medium tracking-wider uppercase">AI Assistant</span>
          </div>
        </button>
      </div>

      <AgentModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
