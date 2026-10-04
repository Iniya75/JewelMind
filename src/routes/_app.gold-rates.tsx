import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sparkles, TrendingUp, TrendingDown, RefreshCw,
  CheckCircle2, AlertCircle, Loader2, Clock,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getGoldRates } from "@/lib/api-service";
import type { GoldRate } from "@/lib/firebase-types";

export const Route = createFileRoute("/_app/gold-rates")({
  component: GoldRatesPage,
  head: () => ({ meta: [{ title: "Gold Rates · JewelMind AI" }] }),
});

function GoldRatesPage() {
  const [rates, setRates] = useState<GoldRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadRates(silent = false) {
    if (!silent) setLoading(true);
    try {
      const r = await getGoldRates();
      setRates(r);
    } catch {
      if (!silent) toast.error("Failed to load gold rates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRates(); }, []);

  async function handleRefreshNow() {
    setRefreshing(true);
    try {
      const token = localStorage.getItem("access_token") || "";
      const res = await fetch("/api/gold_rates/update", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail || "Failed to fetch from GoldAPI.io");
        return;
      }
      toast.success(
        `✅ Rates updated — 22K: ₹${data.rate22k?.toLocaleString("en-IN")}/g · 24K: ₹${data.rate24k?.toLocaleString("en-IN")}/g`
      );
      await loadRates(true);
    } catch (err: any) {
      toast.error(err.message || "Network error");
    } finally {
      setRefreshing(false);
    }
  }

  const sorted = [...rates].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0] ?? null;
  const prev = sorted[1] ?? null;
  const delta22k = latest && prev ? latest.rate22k - prev.rate22k : null;
  const delta24k = latest && prev ? latest.rate24k - prev.rate24k : null;
  const deltaSilver = latest && prev ? (latest.rateSilver ?? 0) - (prev.rateSilver ?? 0) : null;
  const isToday = latest?.date === new Date().toISOString().slice(0, 10);
  const lastUpdated = latest?.lastUpdated
    ? new Date(latest.lastUpdated).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Live Market"
        title="Gold & Silver Rates"
        description="Live rates auto-fetched daily from GoldAPI.io — prices in ₹ per gram."
        actions={
          <Button
            onClick={handleRefreshNow}
            disabled={refreshing}
            className="rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90"
          >
            {refreshing
              ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Fetching…</>
              : <><RefreshCw className="mr-1.5 h-4 w-4" />Refresh Now</>
            }
          </Button>
        }
      />

      {/* API status banner */}
      <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm border ${
        loading ? "bg-secondary/60 border-border/40" :
        isToday ? "bg-emerald-50 border-emerald-200/60 dark:bg-emerald-950/20 dark:border-emerald-800/30" :
        latest ? "bg-amber-50 border-amber-200/60 dark:bg-amber-950/20 dark:border-amber-800/30" :
        "bg-red-50 border-red-200/60 dark:bg-red-950/20 dark:border-red-800/30"
      }`}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> :
          isToday ? <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" /> :
          latest ? <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" /> :
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
        }
        <span className={
          loading ? "text-muted-foreground" :
          isToday ? "text-emerald-800 dark:text-emerald-200" :
          latest ? "text-amber-800 dark:text-amber-200" :
          "text-red-700 dark:text-red-300"
        }>
          {loading ? "Loading rates…" :
            isToday ? `Live rates for today${lastUpdated ? ` · Updated at ${lastUpdated}` : ""} · Source: GoldAPI.io` :
            latest ? `Last fetched: ${latest.date}${lastUpdated ? ` at ${lastUpdated}` : ""} · Click "Refresh Now" to get today's rate` :
            "No gold rates yet — click Refresh Now to fetch from GoldAPI.io"
          }
        </span>
        {latest?.warning && (
          <span className="ml-auto text-xs text-amber-700 dark:text-amber-400 italic">{latest.warning}</span>
        )}
      </div>

      {/* Rate Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <RateCard
          label="22K Gold"
          value={latest ? `₹${latest.rate22k.toLocaleString("en-IN")}/g` : "—"}
          delta={delta22k !== null ? `${delta22k >= 0 ? "+" : ""}₹${delta22k.toFixed(2)} from yesterday` : (latest ? "No previous rate" : "Not available")}
          positive={delta22k === null ? null : delta22k >= 0}
          loading={loading}
        />
        <RateCard
          label="24K Gold"
          value={latest ? `₹${latest.rate24k.toLocaleString("en-IN")}/g` : "—"}
          delta={delta24k !== null ? `${delta24k >= 0 ? "+" : ""}₹${delta24k.toFixed(2)} from yesterday` : ""}
          positive={delta24k === null ? null : delta24k >= 0}
          loading={loading}
        />
        <RateCard
          label="Silver"
          value={latest?.rateSilver ? `₹${(latest.rateSilver ?? 0).toLocaleString("en-IN")}/g` : "—"}
          delta={deltaSilver !== null ? `${deltaSilver >= 0 ? "+" : ""}₹${deltaSilver.toFixed(2)} from yesterday` : ""}
          positive={deltaSilver === null ? null : deltaSilver >= 0}
          loading={loading}
        />
      </div>

      {/* Rate History Table */}
      {sorted.length > 0 && (
        <Card className="luxe-card rounded-3xl border-border/60 p-0">
          <div className="border-b border-border/60 px-5 py-4 font-serif text-lg">Rate History</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  {["Date", "22K (₹/g)", "24K (₹/g)", "Silver (₹/g)", "Source", "Status"].map(h => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => (
                  <tr key={r.id} className="border-t border-border/60 hover:bg-secondary/20 transition">
                    <td className="px-4 py-3 text-muted-foreground font-medium">{r.date}</td>
                    <td className="px-4 py-3 font-semibold text-[var(--gold)]">₹{r.rate22k.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3">₹{r.rate24k.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3">{r.rateSilver ? `₹${(r.rateSilver ?? 0).toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.source || "manual"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.status === "fresh" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : r.status === "stale" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-secondary text-muted-foreground"
                      }`}>{r.status || "manual"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* AI Forward Outlook */}
      <Card className="luxe-card navy-gradient rounded-3xl border-border/60 p-6 text-[var(--navy-foreground)]">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl gold-gradient text-navy">
            <Sparkles className="h-4 w-4" />
          </div>
          <h3 className="font-serif text-xl text-white">AI Forward Outlook · 30 days</h3>
        </div>
        <p className="mt-3 text-sm text-white/80">
          {rates.length === 0
            ? "Click Refresh Now to fetch live gold rates. Once data accumulates, you'll see AI-powered price forecasts and inventory recommendations here."
            : `Based on recent rates, 22K gold is at ₹${latest?.rate22k.toLocaleString("en-IN")}/g. ${
              delta22k !== null && delta22k > 0
                ? "Prices are rising — consider purchasing inventory early before festive season for better margins."
                : delta22k !== null && delta22k < 0
                  ? "Prices are easing — a good time to review buy-back offers with customers."
                  : "Prices are stable today. Continue monitoring for festive season trends."
              }`
          }
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-1 text-xs text-[var(--gold)]">
          <TrendingUp className="h-3.5 w-3.5" />
          {rates.length === 0 ? "Awaiting live data" : `Auto-updated daily · Source: GoldAPI.io`}
        </div>
      </Card>
    </div>
  );
}

function RateCard({
  label, value, delta, positive, loading,
}: {
  label: string; value: string; delta: string; positive: boolean | null; loading?: boolean;
}) {
  return (
    <Card className="luxe-card rounded-3xl border-border/60 p-6">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      {loading ? (
        <div className="mt-3 h-8 w-32 animate-pulse rounded-lg bg-secondary" />
      ) : (
        <div className="mt-2 font-serif text-3xl font-semibold">{value}</div>
      )}
      {delta && !loading && (
        <div className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${
          positive === true ? "text-emerald-700 dark:text-emerald-400"
          : positive === false ? "text-rose-600 dark:text-rose-400"
          : "text-muted-foreground"
        }`}>
          {positive === true && <TrendingUp className="h-3 w-3" />}
          {positive === false && <TrendingDown className="h-3 w-3" />}
          {delta}
        </div>
      )}
    </Card>
  );
}
