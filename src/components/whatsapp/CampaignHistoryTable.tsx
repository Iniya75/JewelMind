import { useEffect, useState } from "react";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Clock, Users } from "lucide-react";

interface Campaign {
  id: string;
  campaign_name: string;
  target_group: string;
  customers_reached: number;
  status: string;
  scheduled_at?: string;
  created_at: string;
}

const API_BASE = "/api";
function getToken() { return localStorage.getItem("access_token") || ""; }

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  completed: { bg: "bg-emerald-50", text: "text-emerald-700", icon: <CheckCircle2 className="h-3 w-3" /> },
  scheduled: { bg: "bg-blue-50", text: "text-blue-700", icon: <Clock className="h-3 w-3" /> },
  pending: { bg: "bg-amber-50", text: "text-amber-700", icon: <Clock className="h-3 w-3" /> },
  running: { bg: "bg-purple-50", text: "text-purple-700", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  failed: { bg: "bg-red-50", text: "text-red-700", icon: <XCircle className="h-3 w-3" /> },
};

function formatDate(ts: string) {
  try { return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return ts; }
}

function getSegmentLabel(tg: string) {
  if (tg === "all") return "All Customers";
  if (tg === "premium") return "Premium";
  if (tg === "inactive") return "Inactive";
  if (tg.startsWith("city:")) return `📍 ${tg.split(":")[1]}`;
  if (tg.startsWith("spend_above:")) return `💰 ₹${Number(tg.split(":")[1]).toLocaleString("en-IN")}+`;
  return tg;
}

export function CampaignHistoryTable({ refreshKey }: { refreshKey?: number }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/whatsapp/history`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setCampaigns(await r.json());
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
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid oklch(0.9 0.012 85)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl text-base"
               style={{ background: "oklch(0.224 0.062 263 / 0.08)" }}>📋</div>
          <span className="font-serif text-base font-semibold" style={{ color: "oklch(0.224 0.062 263)" }}>
            Campaign History
          </span>
        </div>
        <button onClick={load} className="grid h-7 w-7 place-items-center rounded-xl transition hover:bg-secondary/60">
          <RefreshCw className="h-3.5 w-3.5" style={{ color: "oklch(0.55 0.03 263)" }} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "oklch(0.745 0.142 78)" }} />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="py-10 text-center text-sm" style={{ color: "oklch(0.55 0.03 263)" }}>
          No campaigns yet. Create your first broadcast above.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "oklch(0.96 0.01 85)" }}>
                {["Campaign Name", "Segment", "Reached", "Status", "Date"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "oklch(0.55 0.03 263)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const s = STATUS_STYLES[c.status] || STATUS_STYLES.pending;
                return (
                  <tr key={c.id} className="border-t hover:bg-secondary/20 transition" style={{ borderColor: "oklch(0.93 0.01 85)" }}>
                    <td className="px-4 py-3 font-medium" style={{ color: "oklch(0.224 0.062 263)" }}>
                      {c.campaign_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                            style={{ background: "oklch(0.745 0.142 78 / 0.1)", color: "oklch(0.45 0.08 78)" }}>
                        {getSegmentLabel(c.target_group)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" style={{ color: "oklch(0.745 0.142 78)" }} />
                        <span style={{ color: "oklch(0.35 0.05 263)" }}>{c.customers_reached}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${s.bg} ${s.text}`}>
                        {s.icon} {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "oklch(0.55 0.03 263)" }}>
                      {formatDate(c.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
