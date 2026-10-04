/**
 * RealtimeConnection.ts
 * =====================
 * Manages a WebSocket connection to the backend proxy for OpenAI Realtime API.
 * Handles connection lifecycle, reconnection logic, and message routing.
 */

export type ConnectionState = "idle" | "connecting" | "connected" | "disconnecting" | "error";

type StateCallback = (state: ConnectionState) => void;
type MessageCallback = (event: any) => void;
type ErrorCallback = (error: string) => void;

export class RealtimeConnection {
  private ws: WebSocket | null = null;
  private url: string;
  private onStateChange: StateCallback;
  private onMessage: MessageCallback;
  private onError: ErrorCallback;
  private shouldReconnect = true;

  constructor(
    url: string,
    onStateChange: StateCallback,
    onMessage: MessageCallback,
    onError: ErrorCallback
  ) {
    this.url = url;
    this.onStateChange = onStateChange;
    this.onMessage = onMessage;
    this.onError = onError;
  }

  connect() {
    if (this.ws) {
      this.ws.close();
    }

    this.onStateChange("connecting");

    try {
      this.ws = new WebSocket(this.url);
    } catch (err: any) {
      console.error("[RealtimeConnection] WebSocket construction failed:", err);
      this.onStateChange("error");
      this.onError("Failed to connect to voice service.");
      return;
    }

    this.ws.onopen = () => {
      console.log("[RealtimeConnection] WebSocket opened.");
      this.onStateChange("connected");
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      } catch {
        // Ignore non-JSON messages
      }
    };

    this.ws.onerror = (event) => {
      console.error("[RealtimeConnection] WebSocket error:", event);
      this.onStateChange("error");
      this.onError("WebSocket connection error. Please check your network.");
    };

    this.ws.onclose = (event) => {
      console.log(`[RealtimeConnection] WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
      if (this.shouldReconnect && event.code !== 1000 && event.code !== 1008) {
        this.onStateChange("error");
        this.onError(`Connection closed unexpectedly (code ${event.code}).`);
      } else {
        this.onStateChange("idle");
      }
      this.ws = null;
    };
  }

  sendEvent(event: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    } else {
      console.warn("[RealtimeConnection] Cannot send event — WebSocket not open.");
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.onStateChange("disconnecting");
      this.ws.close(1000, "Client disconnected");
      this.ws = null;
    }
    this.onStateChange("idle");
  }

  getState(): ConnectionState {
    if (!this.ws) return "idle";
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return "connecting";
      case WebSocket.OPEN: return "connected";
      case WebSocket.CLOSING: return "disconnecting";
      default: return "idle";
    }
  }
}
