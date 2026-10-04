import React, { useEffect, useRef } from "react";
import { Loader2, Volume2, User } from "lucide-react";
import { TranscriptItem } from "./VoiceContext";

interface StreamingTranscriptProps {
  transcripts: TranscriptItem[];
  isThinking: boolean;
  isSpeaking: boolean;
}

export const StreamingTranscript: React.FC<StreamingTranscriptProps> = ({
  transcripts,
  isThinking,
  isSpeaking,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts, isThinking]);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-2 min-h-[200px] max-h-[350px]">
      {transcripts.length === 0 && !isThinking && (
        <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground p-6">
          <span className="text-3xl mb-2">👋</span>
          <p className="text-xs">Start speaking naturally. I am listening continuously.</p>
        </div>
      )}

      {transcripts.map((t, idx) => {
        const isUser = t.role === "user";
        const showSpeaking = isSpeaking && !isUser && idx === transcripts.length - 1;

        return (
          <div
            key={t.id}
            className={`flex w-full ${isUser ? "justify-end" : "justify-start"} animate-fadeIn`}
          >
            <div
              className={`flex items-start gap-2.5 max-w-[85%] rounded-2xl p-3.5 shadow-sm text-sm ${
                isUser
                  ? "rounded-tr-sm bg-gradient-to-br from-navy to-navy-light text-white"
                  : "rounded-tl-sm bg-white border border-gray-100 text-gray-800"
              }`}
              style={
                isUser
                  ? {
                      background: "linear-gradient(135deg, oklch(0.224 0.062 263), oklch(0.2 0.065 263))",
                    }
                  : {}
              }
            >
              {!isUser && (
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-lg flex-shrink-0"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.82 0.13 82), oklch(0.68 0.15 70))",
                  }}
                >
                  <span className="text-xs">💎</span>
                </div>
              )}

              <div className="flex-1">
                <div
                  className="text-[10px] font-semibold mb-0.5 uppercase tracking-wider"
                  style={{ color: isUser ? "oklch(0.82 0.13 82)" : "oklch(0.45 0.03 263)" }}
                >
                  {isUser ? "You" : "JewelMind AI"}
                </div>
                <p className="leading-relaxed whitespace-pre-wrap">{t.text}</p>
                {showSpeaking && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600 font-medium">
                    <Volume2 className="h-3 w-3 animate-pulse" />
                    <span>Speaking...</span>
                  </div>
                )}
              </div>

              {isUser && (
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-navy-light text-white flex-shrink-0">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {isThinking && (
        <div className="flex justify-start animate-fadeIn">
          <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white border border-gray-100 px-4 py-3 shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
            <span className="text-xs text-gray-500 font-medium">Consulting business records...</span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
