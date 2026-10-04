import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Sparkles } from "lucide-react";
import { AgentResponseCard } from "./AgentResponseCard";



interface ChatPanelProps {
  onConversationSaved?: () => void;
}

interface Message {
  role: "user" | "agent";
  content: string;
  executedTool?: string;
  timestamp: string;
}

const API_BASE = "/api";
const SUGGESTIONS = [
  "Inform all customers about our new bridal collection",
  "Send Akshaya Tritiya offers to premium customers",
  "Predict next month's sales",
  "Which customers are likely to stop buying?",
  "How many customers do we have in total?",
];

function getToken() {
  return localStorage.getItem("access_token") || "";
}

export function ChatPanel({ onConversationSaved }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lastMessageRef = useRef<string>("");
  const retryTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const send = async (text: string, isRetry: boolean = false) => {
    if (!text.trim() || (loading && !isRetry)) return;

    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (!isRetry) {
      const userMsg: Message = { role: "user", content: text, timestamp: new Date().toISOString() };
      setMessages((m) => [...m, userMsg]);
      lastMessageRef.current = text;
    }

    setInput("");
    setLoading(true);

    try {
      const resp = await fetch(`${API_BASE}/realtime/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ message: text }),
      });

      if (!resp.ok) {
        throw new Error(resp.statusText || "Request failed");
      }

      const data = await resp.json();
      const agentResponse = data.agent_response || "";

      // Check if it's a rate limit response
      if (agentResponse.includes("handling many requests")) {
        const agentMsg: Message = {
          role: "agent",
          content: "I'm currently handling many requests. Please try again in a minute.",
          timestamp: new Date().toISOString(),
        };
        setMessages((m) => [...m, agentMsg]);
        return;
      }

      const agentMsg: Message = {
        role: "agent",
        content: agentResponse || "I processed your request.",
        executedTool: data.executed_tool,
        timestamp: data.timestamp || new Date().toISOString(),
      };
      setMessages((m) => [...m, agentMsg]);
      onConversationSaved?.();
    } catch (err) {
      console.error("Chat error:", err);
      const agentMsg: Message = {
        role: "agent",
        content: "I couldn't process your request right now. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((m) => [...m, agentMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "agent" ? (
              <AgentResponseCard
                response={msg.content}
                executedTool={msg.executedTool}
                timestamp={msg.timestamp}
                compact
              />
            ) : (
              <div
                className="max-w-[80%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm shadow-sm"
                style={{
                  background: "linear-gradient(135deg, oklch(0.224 0.062 263), oklch(0.2 0.065 263))",
                  color: "oklch(0.97 0.01 85)",
                }}
              >
                {msg.content}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              className="flex items-center gap-2 rounded-2xl rounded-tl-sm px-4 py-2.5"
              style={{ background: "white", border: "1px solid oklch(0.9 0.012 85)" }}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "oklch(0.745 0.142 78)" }} />
              <span className="text-xs" style={{ color: "oklch(0.55 0.03 263)" }}>Thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.slice(0, 3).map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-xl border px-2.5 py-1 text-[11px] transition hover:opacity-80"
                style={{
                  borderColor: "oklch(0.745 0.142 78 / 0.4)",
                  background: "oklch(0.745 0.142 78 / 0.08)",
                  color: "oklch(0.35 0.06 263)",
                }}
              >
                {s.length > 35 ? s.slice(0, 35) + "…" : s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div
        className="flex items-center gap-2 px-3 py-3 flex-shrink-0"
        style={{ borderTop: "1px solid oklch(0.9 0.012 85)" }}
      >
        <Sparkles className="h-4 w-4 flex-shrink-0" style={{ color: "oklch(0.745 0.142 78)" }} />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
          placeholder='e.g. "Send bridal offers to premium customers"'
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          style={{ color: "oklch(0.224 0.062 263)" }}
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl transition disabled:opacity-40"
          style={{
            background: "linear-gradient(135deg, oklch(0.82 0.13 82), oklch(0.68 0.15 70))",
          }}
        >
          <Send className="h-3.5 w-3.5" style={{ color: "oklch(0.224 0.062 263)" }} />
        </button>
      </div>
    </div>
  );
}
