import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Clock, Wrench } from "lucide-react";

interface ConversationHistoryProps {
  refreshKey?: number;
}

interface Turn {
  id: string;
  user_message: string;
  agent_response: string;
  executed_tool?: string;
  timestamp: string;
}

const API_BASE = "/api";

function getToken() {
  return localStorage.getItem("access_token") || "";
}

function formatDate(ts: string) {
  try {
    return new Date(ts).toLocaleString("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ts; }
}

const TOOL_EMOJIS: Record<string, string> = {
  broadcast_message: "📡",
  send_whatsapp_message: "💬",
  create_campaign: "📋",
  list_campaigns: "📋",
  get_customer_details: "👤",
  generate_bill: "🧾",
  predict_next_month_sales: "📈",
  predict_customer_churn: "⚠️",
  predict_product_demand: "📦",
};

export function ConversationHistory({ refreshKey }: ConversationHistoryProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await fetch(`${API_BASE}/realtime/conversations?limit=20`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!resp.ok) throw new Error(resp.statusText);
        const data = await resp.json();
        setTurns(data);
      } catch (e: any) {
        setError("Could not load history. Ensure the backend is running.");
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "oklch(0.745 0.142 78)" }} />
          <span className="text-xs" style={{ color: "oklch(0.55 0.03 263)" }}>Loading history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid h-full place-items-center px-5">
        <div className="text-center">
          <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-30" style={{ color: "oklch(0.224 0.062 263)" }} />
          <p className="text-xs" style={{ color: "oklch(0.55 0.03 263)" }}>{error}</p>
        </div>
      </div>
    );
  }

  if (turns.length === 0) {
    return (
      <div className="grid h-full place-items-center px-5">
        <div className="text-center">
          <MessageSquare className="mx-auto mb-3 h-10 w-10 opacity-20" style={{ color: "oklch(0.224 0.062 263)" }} />
          <p className="text-sm font-medium" style={{ color: "oklch(0.35 0.05 263)" }}>No conversations yet</p>
          <p className="mt-1 text-xs" style={{ color: "oklch(0.55 0.03 263)" }}>
            Start a chat or use voice to talk to JewelMind AI
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-3 space-y-3">
      {turns.map((turn) => (
        <div
          key={turn.id}
          className="rounded-2xl p-3.5 space-y-2.5"
          style={{
            background: "white",
            border: "1px solid oklch(0.9 0.012 85)",
            boxShadow: "0 1px 4px rgba(7,27,59,0.05)",
          }}
        >
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" style={{ color: "oklch(0.745 0.142 78)" }} />
              <span className="text-[10px]" style={{ color: "oklch(0.55 0.03 263)" }}>
                {formatDate(turn.timestamp)}
              </span>
            </div>
            {turn.executed_tool && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  background: "oklch(0.745 0.142 78 / 0.1)",
                  color: "oklch(0.55 0.08 78)",
                }}
              >
                {TOOL_EMOJIS[turn.executed_tool] || "🔧"} {turn.executed_tool.replace(/_/g, " ")}
              </span>
            )}
          </div>

          {/* User message */}
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
              You
            </div>
            <p className="text-xs italic" style={{ color: "oklch(0.35 0.05 263)" }}>
              "{turn.user_message}"
            </p>
          </div>

          {/* Agent response */}
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.55 0.06 263)" }}>
              JewelMind AI
            </div>
            <p
              className="text-xs leading-relaxed line-clamp-3"
              style={{ color: "oklch(0.35 0.05 263)" }}
            >
              {turn.agent_response}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
