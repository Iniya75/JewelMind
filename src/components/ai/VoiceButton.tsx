import React from "react";
import { Volume2 } from "lucide-react";
import { useVoice } from "./VoiceContext";
import { StreamingTranscript } from "./StreamingTranscript";
import { VoiceControls } from "./VoiceControls";

export function VoiceButton() {
  const {
    connectionStatus,
    transcripts,
    isThinking,
    isSpeaking,
    errorMsg,
    startConversation,
    stopConversation,
    clearTranscripts,
  } = useVoice();

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden bg-oklch(0.969 0.012 85)">
      {/* Scrollable Content (Transcript + Suggestions) */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Suggestion Prompt shown when offline / idle */}
        {connectionStatus === "idle" && transcripts.length === 0 && (
          <div
            className="w-full rounded-2xl p-4 animate-fadeIn"
            style={{
              background: "oklch(0.224 0.062 263 / 0.06)",
              border: "1px solid oklch(0.224 0.062 263 / 0.12)",
            }}
          >
            <div
              className="mb-2.5 text-[10px] uppercase tracking-widest font-semibold"
              style={{ color: "oklch(0.745 0.142 78)" }}
            >
              Try asking about...
            </div>
            {[
              "What are today's sales?",
              "Who has pending payments?",
              "Which products are low in stock?",
              "Predict next month's demand",
            ].map((cmd) => (
              <div key={cmd} className="flex items-start gap-2 py-1.5 hover:opacity-80 transition cursor-pointer">
                <Volume2
                  className="h-3.5 w-3.5 mt-0.5 flex-shrink-0"
                  style={{ color: "oklch(0.745 0.142 78)" }}
                />
                <span
                  className="text-xs"
                  style={{ color: "oklch(0.45 0.03 263)" }}
                >
                  {cmd}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Live Scrolling Transcripts */}
        {(connectionStatus !== "idle" || transcripts.length > 0) && (
          <StreamingTranscript
            transcripts={transcripts}
            isThinking={isThinking}
            isSpeaking={isSpeaking}
          />
        )}
      </div>

      {/* Persistent Voice Control Panel at the bottom */}
      <VoiceControls
        connectionStatus={connectionStatus}
        isThinking={isThinking}
        isSpeaking={isSpeaking}
        errorMsg={errorMsg}
        hasTranscripts={transcripts.length > 0}
        onStart={startConversation}
        onStop={stopConversation}
        onClear={clearTranscripts}
      />
    </div>
  );
}
