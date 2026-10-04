import React from "react";
import { Mic, MicOff, Loader2, RefreshCw } from "lucide-react";
import { ConnectionState } from "./RealtimeConnection";

interface VoiceControlsProps {
  connectionStatus: ConnectionState;
  isThinking: boolean;
  isSpeaking: boolean;
  errorMsg: string;
  hasTranscripts: boolean;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
}

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  connectionStatus,
  isThinking,
  isSpeaking,
  errorMsg,
  hasTranscripts,
  onStart,
  onStop,
  onClear,
}) => {
  const isConnecting = connectionStatus === "connecting";
  const isConnected = connectionStatus === "connected";
  const isActive = isConnected || isSpeaking;

  return (
    <div className="flex flex-col items-center gap-4 px-5 py-4 flex-shrink-0 bg-gray-50/50 border-t border-gray-100 rounded-b-3xl">
      {/* Connection Status Badge */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {isActive && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              isConnected
                ? "bg-emerald-500"
                : isConnecting
                ? "bg-amber-500 animate-pulse"
                : connectionStatus === "error"
                ? "bg-rose-500"
                : "bg-gray-400"
            }`}
          />
        </span>
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
          {connectionStatus === "idle" && "Offline — Tap to talk"}
          {connectionStatus === "connecting" && "Connecting to voice server..."}
          {connectionStatus === "connected" && "Real-time Voice Connected"}
          {connectionStatus === "disconnecting" && "Disconnecting..."}
          {connectionStatus === "error" && "Connection error — please retry"}
        </span>
      </div>

      {/* Main Record Button with dynamic ripple waveforms */}
      <div className="relative flex items-center justify-center h-28 w-full">
        {isConnected && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="absolute h-20 w-20 rounded-full border border-emerald-400/30 animate-ripple-slow" />
            <span className="absolute h-20 w-20 rounded-full border border-emerald-400/20 animate-ripple-fast" />
          </div>
        )}

        <button
          onClick={isConnected ? onStop : onStart}
          disabled={isConnecting}
          className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300 shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50`}
          style={{
            background: isConnected
              ? "linear-gradient(135deg, #10b981, #059669)"
              : "linear-gradient(135deg, oklch(0.224 0.062 263), oklch(0.18 0.07 263))",
          }}
        >
          {isConnecting ? (
            <Loader2 className="h-7 w-7 animate-spin text-white" />
          ) : isConnected ? (
            <MicOff className="h-7 w-7 text-white" />
          ) : (
            <Mic className="h-7 w-7 text-white" />
          )}
        </button>
      </div>

      {/* Feedback Messages */}
      {errorMsg && (
        <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3.5 py-2 text-center w-full max-w-sm">
          {errorMsg}
        </div>
      )}

      {/* Secondary Controls */}
      <div className="flex gap-4">
        {isConnected && (
          <button
            onClick={onStop}
            className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl transition"
          >
            Disconnect
          </button>
        )}
        {hasTranscripts && (
          <button
            onClick={onClear}
            className="text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-4 py-2 rounded-xl transition"
          >
            Clear Transcript
          </button>
        )}
      </div>
    </div>
  );
};
