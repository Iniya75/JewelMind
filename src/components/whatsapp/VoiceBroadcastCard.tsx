import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Send, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { MessagePreviewModal } from "@/components/ai/MessagePreviewModal";

const API_BASE = "/api";
function getToken() { return localStorage.getItem("access_token") || ""; }

type State = "idle" | "recording" | "processing" | "done" | "error";

interface BroadcastResult {
  transcribed: string;
  agentResponse: string;
  executedTool?: string;
}

interface VoiceBroadcastCardProps {
  onBroadcastComplete?: () => void;
}

export function VoiceBroadcastCard({ onBroadcastComplete }: VoiceBroadcastCardProps) {
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    setError(""); setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await process(blob);
      };
      recorder.start();
      setState("recording");
    } catch {
      setError("Microphone access denied."); setState("error");
    }
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setState("processing");
    }
  }, []);

  const process = async (blob: Blob) => {
    setState("processing");
    try {
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      const resp = await fetch(`${API_BASE}/whatsapp/agent/voice`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      if (!resp.ok) throw new Error("Voice processing failed");
      const data = await resp.json();
      setResult({
        transcribed: data.transcribed_text || data.user_message || "",
        agentResponse: data.agent_response || "",
        executedTool: data.executed_tool,
      });
      setState("done");
      if (data.executed_tool === "broadcast_message") {
        toast.success("✅ Voice broadcast sent!");
        onBroadcastComplete?.();
      }
    } catch (e: any) {
      setError(e.message || "Error processing voice"); setState("error");
    }
  };

  return (
    <div
      className="rounded-3xl p-6 space-y-5"
      style={{ background: "white", border: "1px solid oklch(0.9 0.012 85)", boxShadow: "0 1px 2px rgba(7,27,59,0.04), 0 8px 24px -8px rgba(7,27,59,0.08)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg"
             style={{ background: "linear-gradient(135deg, oklch(0.224 0.062 263), oklch(0.18 0.07 263))" }}>
          🎙️
        </div>
        <div>
          <div className="font-serif text-lg font-semibold" style={{ color: "oklch(0.224 0.062 263)" }}>
            Voice Broadcast
          </div>
          <div className="text-xs" style={{ color: "oklch(0.55 0.03 263)" }}>
            Speak to send WhatsApp campaigns
          </div>
        </div>
      </div>

      {/* Button */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={state === "recording" ? stop : (state === "idle" || state === "done" || state === "error") ? start : undefined}
          disabled={state === "processing"}
          className="relative flex h-20 w-20 items-center justify-center rounded-full shadow-xl transition-all active:scale-95"
          style={{
            background: state === "recording"
              ? "linear-gradient(135deg, #dc2626, #b91c1c)"
              : "linear-gradient(135deg, oklch(0.224 0.062 263), oklch(0.18 0.07 263))",
            boxShadow: state === "recording"
              ? "0 0 0 8px rgba(220,38,38,0.15), 0 12px 30px rgba(220,38,38,0.3)"
              : "0 0 0 8px rgba(7,27,59,0.1), 0 12px 30px rgba(7,27,59,0.25)",
          }}
        >
          {state === "processing" ? <Loader2 className="h-7 w-7 animate-spin text-white" />
           : state === "recording" ? (
             <><MicOff className="h-7 w-7 text-white" />
               <span className="absolute inset-0 rounded-full animate-ping opacity-25 bg-red-500" style={{ animationDuration: "1s" }} /></>
           ) : <Mic className="h-7 w-7" style={{ color: "oklch(0.82 0.13 82)" }} />}
        </button>

        <p className="text-sm font-medium text-center" style={{ color: "oklch(0.224 0.062 263)" }}>
          {state === "idle" && "🎤 Tap to record a voice command"}
          {state === "recording" && "🔴 Recording... tap to stop"}
          {state === "processing" && "⏳ Gemini is processing..."}
          {state === "done" && "✅ Done — tap to record again"}
          {state === "error" && "❌ Error — tap to retry"}
        </p>
      </div>

      {/* Example commands */}
      {state === "idle" && (
        <div
          className="rounded-2xl p-4 space-y-2"
          style={{ background: "oklch(0.224 0.062 263 / 0.06)", border: "1px solid oklch(0.224 0.062 263 / 0.1)" }}
        >
          <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
            Voice Commands
          </div>
          {[
            "Send bridal collection announcement to all customers",
            "Send Akshaya Tritiya offers to premium customers",
            "Remind inactive customers to visit us",
          ].map((cmd) => (
            <div key={cmd} className="flex items-center gap-2">
              <Volume2 className="h-3 w-3 flex-shrink-0" style={{ color: "oklch(0.745 0.142 78)" }} />
              <span className="text-xs" style={{ color: "oklch(0.45 0.03 263)" }}>{cmd}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          <div
            className="rounded-2xl p-3.5"
            style={{ background: "oklch(0.224 0.062 263 / 0.08)", border: "1px solid oklch(0.224 0.062 263 / 0.15)" }}
          >
            <div className="mb-1 text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
              You said
            </div>
            <p className="text-sm italic" style={{ color: "oklch(0.35 0.05 263)" }}>"{result.transcribed}"</p>
          </div>
          <div
            className="rounded-2xl p-3.5"
            style={{ background: "white", border: "1px solid oklch(0.9 0.012 85)" }}
          >
            {result.executedTool && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                   style={{ background: "oklch(0.745 0.142 78 / 0.1)", color: "oklch(0.45 0.08 78)" }}>
                🔧 {result.executedTool.replace(/_/g, " ")}
              </div>
            )}
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "oklch(0.224 0.062 263)" }}>
              {result.agentResponse}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
