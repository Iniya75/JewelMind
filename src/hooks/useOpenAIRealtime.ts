/**
 * useOpenAIRealtime.ts
 * ====================
 * React hook that orchestrates a real-time voice session with the JewelMind backend
 * WebSocket proxy endpoint at /api/realtime/voice.
 *
 * Responsibilities:
 *  - Manages connection lifecycle (idle → connecting → connected → idle)
 *  - Captures microphone audio via MicrophoneManager and streams it to the backend
 *  - Plays back AI audio responses via AudioPlayer
 *  - Parses incoming OpenAI Realtime API events and fires onTranscript callbacks
 *  - Handles VAD (server-side voice activity detection) barge-in gracefully
 *  - Authenticates using the JWT stored in localStorage["access_token"]
 *
 * The WebSocket endpoint requires a ?token=<jwt> query param (see backend/routers/realtime_router.py).
 * The Vite dev server proxies /api → http://localhost:8001 so we use a path-relative WS URL.
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { RealtimeConnection, ConnectionState } from "../components/ai/RealtimeConnection";
import { MicrophoneManager } from "../components/ai/MicrophoneManager";
import { AudioPlayer } from "../components/ai/AudioPlayer";

// ─── Types ────────────────────────────────────────────────────────────────────

type TranscriptRole = "user" | "assistant";

export interface UseOpenAIRealtimeOptions {
  /** Called whenever a transcript delta or final transcript arrives. */
  onTranscript: (role: TranscriptRole, text: string, isFinal: boolean) => void;
}

export interface UseOpenAIRealtimeReturn {
  connectionState: ConnectionState;
  isThinking: boolean;
  isSpeaking: boolean;
  errorMsg: string;
  startConversation: () => Promise<void>;
  stopConversation: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the WebSocket URL for the voice proxy.
 * In development, Vite proxies /api → http://localhost:8001 including ws:// upgrades.
 * In production the same path works if the backend is co-located.
 */
function buildWsUrl(token: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/api/realtime/voice?token=${encodeURIComponent(token)}`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOpenAIRealtime({
  onTranscript,
}: UseOpenAIRealtimeOptions): UseOpenAIRealtimeReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Stable refs so callbacks don't go stale
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const micRef = useRef<MicrophoneManager | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const onTranscriptRef = useRef(onTranscript);

  // Keep transcript callback ref current
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  const cleanupAll = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;

    playerRef.current?.close().catch(() => {});
    playerRef.current = null;

    connectionRef.current?.disconnect();
    connectionRef.current = null;
  }, []);

  useEffect(() => {
    return () => cleanupAll();
  }, [cleanupAll]);

  // ─── Incoming event handler ────────────────────────────────────────────────

  const handleMessage = useCallback((event: any) => {
    const type: string = event?.type ?? "";

    switch (type) {
      // Server-side or proxy error
      case "error": {
        const msg: string =
          event?.message ??
          event?.error?.message ??
          "Voice connection error.";
        console.error("[useOpenAIRealtime] Server error:", msg);
        setErrorMsg(msg);
        setIsThinking(false);
        setIsSpeaking(false);
        break;
      }

      // Session ready (sent by backend after session.update is acknowledged)
      case "session.created":
      case "session.updated":
        console.log("[useOpenAIRealtime] Session ready.");
        break;

      // AI is generating a response
      case "response.created":
        setIsThinking(true);
        setIsSpeaking(false);
        break;

      // AI finished the full response
      case "response.done":
        setIsThinking(false);
        setIsSpeaking(false);
        break;

      // AI audio chunk arriving — play it
      case "response.audio.delta": {
        const delta: string = event?.delta ?? "";
        if (delta && playerRef.current) {
          setIsThinking(false);
          setIsSpeaking(true);
          playerRef.current.enqueue(delta);
        }
        break;
      }

      // AI finished speaking
      case "response.audio.done":
        setIsSpeaking(false);
        break;

      // AI speech → text transcript (what the AI said)
      case "response.audio_transcript.delta": {
        const delta: string = event?.delta ?? "";
        if (delta) {
          onTranscriptRef.current("assistant", delta, false);
        }
        break;
      }

      case "response.audio_transcript.done": {
        const transcript: string = event?.transcript ?? "";
        if (transcript) {
          onTranscriptRef.current("assistant", transcript, true);
        }
        break;
      }

      // User speech → text transcript (what the user said)
      case "conversation.item.input_audio_transcription.delta": {
        const delta: string = event?.delta ?? "";
        if (delta) {
          onTranscriptRef.current("user", delta, false);
        }
        break;
      }

      case "conversation.item.input_audio_transcription.completed": {
        const transcript: string = event?.transcript ?? "";
        if (transcript) {
          onTranscriptRef.current("user", transcript, true);
        }
        break;
      }

      // Barge-in: user started speaking while AI was playing audio
      case "input_audio_buffer.speech_started":
        playerRef.current?.stop();
        setIsSpeaking(false);
        setIsThinking(false);
        break;

      // User stopped speaking — AI will begin processing
      case "input_audio_buffer.speech_stopped":
        setIsThinking(true);
        break;

      default:
        // Silently ignore: rate_limits, conversation.item.created, etc.
        break;
    }
  }, []);

  // ─── Start conversation ────────────────────────────────────────────────────

  const startConversation = useCallback(async () => {
    if (connectionState !== "idle" && connectionState !== "error") return;

    setErrorMsg("");
    setIsThinking(false);
    setIsSpeaking(false);

    // Retrieve JWT — the whole codebase uses localStorage["access_token"]
    const token = localStorage.getItem("access_token") || "";
    if (!token) {
      setErrorMsg("You must be logged in to use the voice assistant.");
      setConnectionState("error");
      return;
    }

    const wsUrl = buildWsUrl(token);

    // Create WebSocket connection
    const connection = new RealtimeConnection(
      wsUrl,
      (state) => {
        setConnectionState(state);
        if (state === "error") {
          setIsThinking(false);
          setIsSpeaking(false);
        }
      },
      handleMessage,
      (errMsg) => setErrorMsg(errMsg)
    );
    connectionRef.current = connection;

    // Initialize audio player before connecting
    const player = new AudioPlayer();
    playerRef.current = player;
    try {
      await player.init();
    } catch (err) {
      console.error("[useOpenAIRealtime] AudioPlayer init failed:", err);
      setErrorMsg("Could not initialize audio playback.");
      setConnectionState("error");
      return;
    }

    // Open the WebSocket (state → connecting → connected)
    connection.connect();

    // Request microphone access and start streaming
    const mic = new MicrophoneManager((base64Audio: string) => {
      connectionRef.current?.sendEvent({
        type: "input_audio_buffer.append",
        audio: base64Audio,
      });
    });
    micRef.current = mic;

    try {
      await mic.start();
    } catch (err: any) {
      console.error("[useOpenAIRealtime] Microphone error:", err);
      setErrorMsg(
        err?.name === "NotAllowedError"
          ? "Microphone access denied. Please allow microphone access in your browser settings."
          : "Could not access microphone. Please check your device settings."
      );
      setConnectionState("error");
      cleanupAll();
    }
  }, [connectionState, handleMessage, cleanupAll]);

  // ─── Stop conversation ─────────────────────────────────────────────────────

  const stopConversation = useCallback(() => {
    cleanupAll();
    setIsThinking(false);
    setIsSpeaking(false);
    setErrorMsg("");
    // connectionState will be set to "idle" by RealtimeConnection.disconnect() callback
  }, [cleanupAll]);

  return {
    connectionState,
    isThinking,
    isSpeaking,
    errorMsg,
    startConversation,
    stopConversation,
  };
}
