import { useEffect, useState } from "react";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Clock, Eye } from "lucide-react";

interface DeliveryRow {
  id: string;
  customer_name?: string;
  phone: string;
  message: string;
  status: string;
  meta_message_id?: string;
  error?: string;
  created_at: string;
}

const API_BASE = "/api";
function getToken() { return localStorage.getItem("access_token") || ""; }

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  sent:       { label: "Sent",      bg: "bg-blue-50",    text: "text-blue-700",    icon: <CheckCircle2 className="h-3 w-3" /> },
  delivered:  { label: "Delivered", bg: "bg-emerald-50", text: "text-emerald-700", icon: <CheckCircle2 className="h-3 w-3" /> },
  read:       { label: "Read",      bg: "bg-teal-50",    text: "text-teal-700",    icon: <Eye className="h-3 w-3" /> },
  failed:     { label: "Failed",    bg: "bg-red-50",     text: "text-red-700",     icon: <XCircle className="h-3 w-3" /> },
  pending:    { label: "Pending",   bg: "bg-amber-50",   text: "text-amber-700",   icon: <Clock className="h-3 w-3" /> },
};

function formatDate(ts: string) {
  try { return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return ts; }
}

export function DeliveryStatusTable({ refreshKey }: { refreshKey?: number }) {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/whatsapp/delivery-status?limit=100`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setRows(await r.json());
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [refreshKey]);

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{ background: "white", border: "1px solid oklch(0.9 0.012 85)", boxShadow: "0 1px 2px rgba(7,27,59,0.04), 0 8px 24px -8px rgba(7,27,59,0.08)" }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: "1px solid oklch(0.9 0.012 85)" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl text-base" style={{ background: "oklch(0.224 0.062 263 / 0.08)" }}>
            📊
          </div>
          <span className="font-serif text-base font-semibold" style={{ color: "oklch(0.224 0.062 263)" }}>
            Delivery Status
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "oklch(0.9 0.012 85)" }}>
            {["all", "sent", "delivered", "read", "failed", "pending"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-2.5 py-1 text-[11px] font-medium capitalize transition"
                style={{
                  background: filter === f ? "oklch(0.224 0.062 263)" : "white",
                  color: filter === f ? "oklch(0.82 0.13 82)" : "oklch(0.55 0.03 263)",
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <button onClick={load} className="grid h-7 w-7 place-items-center rounded-xl hover:bg-secondary/60 transition">
            <RefreshCw className="h-3.5 w-3.5" style={{ color: "oklch(0.55 0.03 263)" }} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "oklch(0.745 0.142 78)" }} /></div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm" style={{ color: "oklch(0.55 0.03 263)" }}>
          No delivery records found. Send a broadcast to see statuses here.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "oklch(0.96 0.01 85)" }}>
                {["Customer", "Phone", "Message Preview", "Status", "Error", "Time"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "oklch(0.55 0.03 263)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const sc = STATUS_CONFIG[row.status] || STATUS_CONFIG.pending;
                return (
                  <tr key={row.id} className="border-t hover:bg-secondary/20 transition" style={{ borderColor: "oklch(0.93 0.01 85)" }}>
                    <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: "oklch(0.224 0.062 263)" }}>
                      {row.customer_name || "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs" style={{ color: "oklch(0.45 0.03 263)" }}>
                      {row.phone}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate" style={{ color: "oklch(0.45 0.03 263)" }}>
                      {row.message}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${sc.bg} ${sc.text}`}>
                        {sc.icon}{sc.label}
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-xs" style={{ color: "oklch(0.5 0.15 25)" }} title={row.error || ""}>
                      {row.error || "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "oklch(0.55 0.03 263)" }}>
                      {formatDate(row.created_at)}
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
