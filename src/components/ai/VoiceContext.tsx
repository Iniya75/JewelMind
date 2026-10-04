import React, { createContext, useContext, useState, useCallback } from "react";
import { useOpenAIRealtime } from "../../hooks/useOpenAIRealtime";
import type { ConnectionState } from "./RealtimeConnection";

export interface TranscriptItem {
  id: string;
  role: "user" | "assistant";
  text: string;
  isFinal: boolean;
  timestamp: string;
}

interface VoiceContextProps {
  connectionStatus: ConnectionState;
  transcripts: TranscriptItem[];
  isThinking: boolean;
  isSpeaking: boolean;
  errorMsg: string;
  startConversation: () => Promise<void>;
  stopConversation: () => void;
  clearTranscripts: () => void;
}

const VoiceContext = createContext<VoiceContextProps | undefined>(undefined);

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);

  // Callback to handle transcripts from useOpenAIRealtime hook
  const handleTranscript = useCallback((role: "user" | "assistant", text: string, isFinal: boolean) => {
    setTranscripts((prev) => {
      // Find if we already have an in-progress transcript of the same role
      const last = prev[prev.length - 1];
      if (last && last.role === role && !last.isFinal) {
        // Update the last transcript
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          text,
          isFinal,
        };
        return updated;
      } else {
        // Append a new transcript item
        return [
          ...prev,
          {
            id: Math.random().toString(36).substring(2),
            role,
            text,
            isFinal,
            timestamp: new Date().toISOString(),
          },
        ];
      }
    });
  }, []);

  const {
    connectionState: connectionStatus,
    isThinking,
    isSpeaking,
    errorMsg,
    startConversation,
    stopConversation,
  } = useOpenAIRealtime({
    onTranscript: handleTranscript,
  });

  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  return (
    <VoiceContext.Provider
      value={{
        connectionStatus,
        transcripts,
        isThinking,
        isSpeaking,
        errorMsg,
        startConversation,
        stopConversation,
        clearTranscripts,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
};

export const useVoice = () => {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error("useVoice must be used within a VoiceProvider");
  }
  return context;
};
