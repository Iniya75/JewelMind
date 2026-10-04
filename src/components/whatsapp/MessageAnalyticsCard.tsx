import { useEffect, useState } from "react";
import { Loader2, TrendingUp, Users, CheckCircle2, XCircle, Send } from "lucide-react";

interface Analytics {
  total_customers_targeted: number;
  messages_sent: number;
  successful_deliveries: number;
  failed_deliveries: number;
  delivery_percentage: number;
  total_campaigns: number;
  status_breakdown: {
    sent: number; delivered: number; read: number; failed: number; pending: number;
  };
}

const API_BASE = "/api";
function getToken() { return localStorage.getItem("access_token") || ""; }

function KpiTile({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: any; color: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 space-y-2"
      style={{ background: "white", border: "1px solid oklch(0.9 0.012 85)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
          {label}
        </span>
        <div
          className="grid h-8 w-8 place-items-center rounded-xl"
          style={{ background: `${color}15` }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
      </div>
      <div className="font-serif text-2xl font-bold" style={{ color: "oklch(0.224 0.062 263)" }}>
        {value}
      </div>
      {sub && <div className="text-[11px]" style={{ color: "oklch(0.55 0.03 263)" }}>{sub}</div>}
    </div>
  );
}

export function MessageAnalyticsCard({ refreshKey }: { refreshKey?: number }) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API_BASE}/whatsapp/analytics`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        setData(await r.json());
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, [refreshKey]);

  if (loading) {
    return (
      <div
        className="rounded-3xl p-6 flex items-center justify-center"
        style={{ background: "white", border: "1px solid oklch(0.9 0.012 85)", minHeight: "180px" }}
      >
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "oklch(0.745 0.142 78)" }} />
      </div>
    );
  }

  if (!data) return null;

  const pct = data.delivery_percentage.toFixed(1);

  return (
    <div
      className="rounded-3xl p-6 space-y-5"
      style={{ background: "white", border: "1px solid oklch(0.9 0.012 85)", boxShadow: "0 1px 2px rgba(7,27,59,0.04), 0 8px 24px -8px rgba(7,27,59,0.08)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg"
             style={{ background: "linear-gradient(135deg, oklch(0.224 0.062 263), oklch(0.18 0.07 263))" }}>
          📊
        </div>
        <div>
          <div className="font-serif text-lg font-semibold" style={{ color: "oklch(0.224 0.062 263)" }}>
            Message Analytics
          </div>
          <div className="text-xs" style={{ color: "oklch(0.55 0.03 263)" }}>Live from MySQL</div>
        </div>

        {/* Delivery bar */}
        <div className="ml-auto text-right">
          <div className="text-2xl font-bold font-serif" style={{ color: data.delivery_percentage >= 70 ? "oklch(0.62 0.14 155)" : "oklch(0.6 0.21 25)" }}>
            {pct}%
          </div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: "oklch(0.55 0.03 263)" }}>Delivery Rate</div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile label="Targeted" value={data.total_customers_targeted} icon={Users} color="oklch(0.224 0.062 263)" />
        <KpiTile label="Sent" value={data.messages_sent} icon={Send} color="oklch(0.55 0.1 263)" />
        <KpiTile label="Delivered" value={data.successful_deliveries} icon={CheckCircle2} color="oklch(0.62 0.14 155)" />
        <KpiTile label="Failed" value={data.failed_deliveries} icon={XCircle} color="oklch(0.6 0.21 25)" />
        <KpiTile label="Campaigns" value={data.total_campaigns} icon={TrendingUp} color="oklch(0.745 0.142 78)" />
      </div>

      {/* Delivery bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px]" style={{ color: "oklch(0.55 0.03 263)" }}>
          <span>Delivery progress</span>
          <span>{data.successful_deliveries}/{data.messages_sent}</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "oklch(0.93 0.01 85)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(data.delivery_percentage, 100)}%`,
              background: data.delivery_percentage >= 70
                ? "linear-gradient(90deg, oklch(0.62 0.14 155), oklch(0.70 0.14 155))"
                : "linear-gradient(90deg, oklch(0.745 0.142 78), oklch(0.68 0.15 70))",
            }}
          />
        </div>
      </div>

      {/* Status breakdown */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(data.status_breakdown).map(([status, count]) => (
          count > 0 && (
            <div key={status}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{
                background: status === "delivered" || status === "read" ? "oklch(0.62 0.14 155 / 0.1)" : status === "failed" ? "oklch(0.6 0.21 25 / 0.1)" : "oklch(0.224 0.062 263 / 0.08)",
                color: status === "delivered" || status === "read" ? "oklch(0.42 0.14 155)" : status === "failed" ? "oklch(0.45 0.18 25)" : "oklch(0.35 0.05 263)",
              }}
            >
              {status}: {count}
            </div>
          )
        ))}
      </div>
    </div>
  );
}
