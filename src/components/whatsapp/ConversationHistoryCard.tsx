import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Clock, RefreshCw, Wrench } from "lucide-react";

interface Conversation {
  id: string;
  user_message: string;
  agent_response: string;
  executed_tool?: string;
  timestamp: string;
}

const API_BASE = "/api";
function getToken() { return localStorage.getItem("access_token") || ""; }

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

function formatDate(ts: string) {
  try { return new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return ts; }
}

export function ConversationHistoryCard({ refreshKey }: { refreshKey?: number }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/whatsapp/agent/conversations?limit=20`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setConversations(await r.json());
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [refreshKey]);

  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{ background: "white", border: "1px solid oklch(0.9 0.012 85)", boxShadow: "0 1px 2px rgba(7,27,59,0.04), 0 8px 24px -8px rgba(7,27,59,0.08)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid oklch(0.9 0.012 85)" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl text-base" style={{ background: "oklch(0.224 0.062 263 / 0.08)" }}>
            💬
          </div>
          <span className="font-serif text-base font-semibold" style={{ color: "oklch(0.224 0.062 263)" }}>
            AI Conversation History
          </span>
        </div>
        <button onClick={load} className="grid h-7 w-7 place-items-center rounded-xl hover:bg-secondary/60 transition">
          <RefreshCw className="h-3.5 w-3.5" style={{ color: "oklch(0.55 0.03 263)" }} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "oklch(0.745 0.142 78)" }} />
        </div>
      ) : conversations.length === 0 ? (
        <div className="py-10 text-center">
          <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-20" style={{ color: "oklch(0.224 0.062 263)" }} />
          <p className="text-sm" style={{ color: "oklch(0.55 0.03 263)" }}>
            No conversations yet. Use the 💎 AI Assistant to start chatting.
          </p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "oklch(0.93 0.01 85)" }}>
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className="cursor-pointer px-5 py-4 transition hover:bg-secondary/20"
              onClick={() => setExpanded(expanded === conv.id ? null : conv.id)}
            >
              {/* Row header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* User query */}
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full grid place-items-center text-[9px] font-bold"
                         style={{ background: "oklch(0.224 0.062 263)", color: "oklch(0.82 0.13 82)" }}>
                      Y
                    </div>
                    <p className="text-sm font-medium truncate" style={{ color: "oklch(0.224 0.062 263)" }}>
                      {conv.user_message}
                    </p>
                  </div>
                  {/* Agent reply preview */}
                  <p className="mt-1.5 ml-6 text-xs line-clamp-1" style={{ color: "oklch(0.55 0.03 263)" }}>
                    {conv.agent_response}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <div className="flex items-center gap-1 text-[10px]" style={{ color: "oklch(0.65 0.02 263)" }}>
                    <Clock className="h-2.5 w-2.5" />
                    {formatDate(conv.timestamp)}
                  </div>
                  {conv.executed_tool && (
                    <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: "oklch(0.745 0.142 78 / 0.1)", color: "oklch(0.45 0.08 78)" }}>
                      {TOOL_EMOJIS[conv.executed_tool] || <Wrench className="h-2.5 w-2.5" />}
                      {conv.executed_tool.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </div>

              {/* Expanded content */}
              {expanded === conv.id && (
                <div
                  className="mt-3 rounded-2xl p-3.5 text-xs leading-relaxed whitespace-pre-wrap"
                  style={{
                    background: "oklch(0.97 0.008 85)",
                    border: "1px solid oklch(0.91 0.01 85)",
                    color: "oklch(0.35 0.05 263)",
                  }}
                >
                  {conv.agent_response}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
