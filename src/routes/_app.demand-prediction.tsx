import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend,
} from "recharts";
import {
  Brain, Sparkles, Calendar, Tag, Coins,
  PartyPopper, Heart, Package, TrendingUp,
  AlertTriangle, CheckCircle2, XCircle,
  Loader2, ChevronRight, History, BarChart2,
  IndianRupee, Target, TrendingDown, RefreshCw,
} from "lucide-react";
import {
  runPrediction, getPredictionHistory, getPredictionChartData,
  getModelStatus, getEncoderLabels,
  type PredictionInput, type PredictionOutput,
  type PredictionHistoryItem, type PredictionChartData,
  type ModelStatus, type EncoderLabels,
} from "@/lib/prediction-api";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/demand-prediction")({
  component: DemandPredictionPage,
  head: () => ({ meta: [{ title: "Demand Prediction & Sales Forecast · JewelMind AI" }] }),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function fmtTS(ts: string) {
  try {
    return new Date(ts).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ts; }
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
}

function fmtINR(v: number) {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const CHART_COLORS = ["#C8A96E", "#D4AF37", "#B8961C", "#E8C97A", "#F0D98A", "#A07818"];

function getToken() { return localStorage.getItem("access_token") || ""; }

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...opts.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.json();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModelStatusBanner({ status }: { status: ModelStatus | null }) {
  if (!status) return null;

  const items = [
    { key: "demand_model", label: "Demand Model" },
    { key: "category_encoder", label: "Category Encoder" },
    { key: "festival_encoder", label: "Festival Encoder" },
    { key: "sales_model", label: "Sales Model" },
  ] as const;

  const allCriticalReady =
    status.demand_model === "ready" &&
    status.category_encoder === "ready" &&
    status.festival_encoder === "ready";

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-xs ${
      allCriticalReady
        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
        : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400"
    }`}>
      {allCriticalReady
        ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
        : <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
      <span className="font-medium mr-1">
        {allCriticalReady ? "Pre-trained models ready" : "Some models missing — place .joblib files in backend/ml/models/"}
      </span>
      {items.map(({ key, label }) => (
        <span key={key} className="flex items-center gap-1">
          {status[key] === "ready"
            ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            : <XCircle className="h-3 w-3 text-rose-500" />}
          {label}
        </span>
      ))}
    </div>
  );
}


function ResultCard({ result }: { result: PredictionOutput }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-[var(--gold)]/20 p-6"
      style={{ background: "linear-gradient(135deg,#0B1A3A 0%,#1A0B2E 100%)" }}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--gold)]/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-purple-600/10 blur-3xl" />

      <div className="relative">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-1.5 text-[11px] uppercase tracking-widest text-[var(--gold)]">
          <Sparkles className="h-3.5 w-3.5" /> Prediction Result
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Predicted Demand</p>
            <p className="font-serif text-5xl font-bold text-white tabular-nums">
              {result.predicted_demand.toFixed(1)}
            </p>
            <p className="mt-1 text-xs text-white/40">units expected</p>
          </div>
          {result.predicted_sales != null && (
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Predicted Sales</p>
              <p className="font-serif text-5xl font-bold text-[var(--gold)] tabular-nums">
                {result.predicted_sales.toFixed(1)}
              </p>
              <p className="mt-1 text-xs text-white/40">units forecast</p>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            <Tag className="h-3.5 w-3.5 text-[var(--gold)]" /> {result.category}
          </span>
          {result.festival && result.festival !== "No" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/20 bg-purple-400/10 px-3 py-1 text-xs text-purple-300">
              <PartyPopper className="h-3.5 w-3.5" /> {result.festival}
            </span>
          )}
        </div>
        <p className="mt-3 text-[10px] text-white/30">
          Predicted at {fmtTS(result.prediction_timestamp)}
        </p>
      </div>
    </div>
  );
}


function HistoryTable({ items }: { items: PredictionHistoryItem[] }) {
  if (!items.length) {
    return (
      <div className="grid h-40 place-items-center rounded-2xl border border-border bg-secondary/20 text-sm text-muted-foreground">
        No predictions yet — run your first prediction above.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/30">
            {["Date", "Category", "Festival", "Gold Rate", "Pred. Demand", "Pred. Sales", "Predicted On"].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={row.id}
              className={`border-b border-border/50 transition hover:bg-secondary/20 ${i % 2 === 0 ? "" : "bg-secondary/10"}`}>
              <td className="px-4 py-3 whitespace-nowrap">{fmtDate(row.prediction_date)}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--gold)]/10 px-2 py-0.5 text-xs text-[var(--gold)]">
                  {row.category}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{row.festival || "—"}</td>
              <td className="px-4 py-3 tabular-nums text-muted-foreground">
                {row.gold_rate != null ? `₹${row.gold_rate.toLocaleString("en-IN")}` : "—"}
              </td>
              <td className="px-4 py-3 tabular-nums font-semibold">
                {row.predicted_demand != null ? row.predicted_demand.toFixed(1) : "—"}
              </td>
              <td className="px-4 py-3 tabular-nums text-[var(--gold)]">
                {row.predicted_sales != null ? row.predicted_sales.toFixed(1) : "—"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                {fmtTS(row.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Sales Forecast Tab ───────────────────────────────────────────────────────

type SalesForecastData = {
  status: string;
  predictions: {
    month: string;
    month_num: number;
    year: number;
    predicted_revenue: number;
    formatted_revenue: string;
    confidence?: string;
    is_festival_month?: boolean;
    growth_pct?: number | null;
  }[];
  total_predicted_revenue: number;
  formatted_total: string;
  avg_monthly_revenue: number;
  summary?: string;
  historical_months_used?: number;
  months_ahead?: number;
};

function SalesForecastTab() {
  const [months, setMonths] = useState(3);
  const [data, setData] = useState<SalesForecastData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runForecast = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch("/predict-sales", {
        method: "POST",
        body: JSON.stringify({ months_ahead: months }),
      });
      setData(result);
      toast.success(`Sales forecast complete — ${result.predictions?.length || 0} months predicted`);
    } catch (err: any) {
      const msg = err.message || "Forecast failed";
      setError(msg);
      // If model not trained, suggest training
      if (msg.toLowerCase().includes("not trained") || msg.toLowerCase().includes("no data")) {
        toast.error("Not enough historical data yet. Add bills/sales data first.");
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [months]);

  const CONFIDENCE_COLORS: Record<string, string> = {
    high: "text-emerald-500",
    medium: "text-amber-500",
    low: "text-rose-500",
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="luxe-card rounded-3xl border-border/60">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-[var(--gold)]" /> Sales Revenue Forecast
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Forecast future monthly revenue based on your historical billing data using your XGBoost model.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Months to Forecast
              </label>
              <div className="flex items-center gap-2">
                {[1, 3, 6, 12].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMonths(m)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition border ${
                      months === m
                        ? "bg-[var(--gold)] text-navy border-[var(--gold)]"
                        : "border-border text-muted-foreground hover:bg-secondary/40"
                    }`}
                  >
                    {m}M
                  </button>
                ))}
              </div>
            </div>

            <button
              id="run-sales-forecast"
              onClick={runForecast}
              disabled={loading}
              className="flex items-center gap-2 rounded-2xl bg-[var(--gold)] px-6 py-2.5 text-sm font-semibold text-navy shadow-lg transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Forecasting…</>
              ) : (
                <><Brain className="h-4 w-4" /> Run Forecast <ChevronRight className="h-4 w-4" /></>
              )}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Error state */}
      {error && !data && (
        <Card className="luxe-card rounded-3xl border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-300">Forecast Not Available</p>
              <p className="text-sm text-amber-600/80 dark:text-amber-400/80 mt-1">{error}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Add billing records first, then run the forecast again. The model trains on your historical data.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Results */}
      {data && data.predictions && data.predictions.length > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                label: "Total Predicted Revenue",
                value: fmtINR(data.total_predicted_revenue),
                icon: IndianRupee,
                color: "text-emerald-500",
              },
              {
                label: "Avg Monthly Revenue",
                value: fmtINR(data.avg_monthly_revenue),
                icon: Target,
                color: "text-blue-500",
              },
              {
                label: "Months Forecasted",
                value: data.predictions.length,
                icon: Calendar,
                color: "text-[var(--gold)]",
              },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="luxe-card rounded-2xl border-border/60 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
                </div>
                <p className="font-serif text-2xl font-bold">{value}</p>
              </Card>
            ))}
          </div>

          {/* Forecast Chart */}
          <Card className="luxe-card rounded-3xl border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <BarChart2 className="h-4 w-4 text-[var(--gold)]" /> Monthly Revenue Forecast
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.predictions} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C8A96E" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#C8A96E" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`}
                  />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", fontSize: "12px" }}
                    formatter={(v: number) => [fmtINR(v), "Predicted Revenue"]}
                  />
                  <Bar dataKey="predicted_revenue" fill="url(#revenueGrad)" radius={[6, 6, 0, 0]}>
                    {data.predictions.map((p, i) => (
                      <Cell key={i} fill={p.is_festival_month ? "#D4AF37" : "#C8A96E"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Predictions Table */}
          <Card className="luxe-card rounded-3xl border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Calendar className="h-4 w-4 text-[var(--gold)]" /> Month-by-Month Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {["Month", "Predicted Revenue", "Growth", "Confidence", "Festival"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.predictions.map((p, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-secondary/20 transition">
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            {p.month}
                            {p.is_festival_month && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-300 px-1.5 py-0.5 rounded-full">
                                🪔 Festival
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-[var(--gold)]">
                          {p.formatted_revenue}
                        </td>
                        <td className="px-4 py-3">
                          {p.growth_pct != null ? (
                            <span className={`flex items-center gap-1 ${p.growth_pct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                              {p.growth_pct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {p.growth_pct >= 0 ? "+" : ""}{p.growth_pct}%
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {p.confidence ? (
                            <span className={`capitalize text-xs font-medium ${CONFIDENCE_COLORS[p.confidence.toLowerCase()] || "text-muted-foreground"}`}>
                              {p.confidence}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {p.is_festival_month ? "Yes 🪔" : "No"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data.summary && (
                <div className="mt-4 rounded-2xl border border-border/50 bg-secondary/20 p-4 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">📊 AI Insight</p>
                  {data.summary}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const DEFAULT_FORM: PredictionInput = {
  date: todayISO(),
  product_id: "0",
  category: "",
  gold_rate: 7200,
  festival: "No",
  wedding_season: 0,
  current_stock: 10,
  previous_sales: 5,
};

function DemandPredictionPage() {
  const [form, setForm] = useState<PredictionInput>(DEFAULT_FORM);
  const [result, setResult] = useState<PredictionOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [labels, setLabels] = useState<EncoderLabels>({ categories: [], festivals: [] });
  const [history, setHistory] = useState<PredictionHistoryItem[]>([]);
  const [chartData, setChartData] = useState<PredictionChartData | null>(null);
  const [activeTab, setActiveTab] = useState<"form" | "forecast" | "history" | "charts">("form");

  useEffect(() => {
    getModelStatus().then(setStatus).catch(() => {});
    getEncoderLabels()
      .then((l) => {
        setLabels(l);
        if (l.categories.length > 0) {
          setForm((f) => ({ ...f, category: f.category || l.categories[0] }));
        }
      })
      .catch(() => {});
    refreshHistory();
  }, []);

  const refreshHistory = useCallback(() => {
    getPredictionHistory(30).then(setHistory).catch(() => {});
    getPredictionChartData().then(setChartData).catch(() => {});
  }, []);

  function setField<K extends keyof PredictionInput>(key: K, value: PredictionInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.category) { toast.error("Please select a category."); return; }
    setLoading(true);
    try {
      const out = await runPrediction(form);
      setResult(out);
      toast.success(`Demand predicted: ${out.predicted_demand.toFixed(1)} units`);
      refreshHistory();
    } catch (err: any) {
      toast.error(err.message || "Prediction failed");
    } finally {
      setLoading(false);
    }
  }

  const TABS = [
    { key: "form", label: "Predict", icon: Sparkles },
    { key: "history", label: "History", icon: History },
    { key: "charts", label: "Charts", icon: BarChart2 },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI · Machine Learning"
        title="Demand Prediction & Sales Forecast"
        description="Run pre-trained Colab models for product demand prediction and forecast monthly revenue from your billing history."
        actions={
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--gold)]/30 bg-amber-50/50 dark:bg-amber-950/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
            <Brain className="h-3.5 w-3.5" /> ML Models Active
          </div>
        }
      />

      {/* Tab bar */}
      <div className="flex gap-1 rounded-2xl border border-border bg-secondary/20 p-1 w-fit flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            id={`tab-${key}`}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
              activeTab === key
                ? "bg-[var(--gold)] text-navy shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── TAB: PREDICT FORM ──────────────────────────────────────────────── */}
      {activeTab === "form" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input form */}
          <Card className="luxe-card rounded-3xl border-border/60">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-[var(--gold)]" /> Prediction Inputs
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Features: month · day · day_of_week · week (from date) · category · gold_rate · festival · wedding_season · current_stock · previous_sales
              </p>
            </CardHeader>
            <CardContent>
              <form id="predict-form" onSubmit={handleSubmit} className="space-y-5">
                {/* Date */}
                <div className="space-y-1.5">
                  <label htmlFor="predict-date" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Calendar className="h-3.5 w-3.5" /> Prediction Date
                  </label>
                  <input
                    id="predict-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setField("date", e.target.value)}
                    required
                    className="w-full rounded-xl border border-border bg-secondary/30 px-4 py-2.5 text-sm text-foreground focus:border-[var(--gold)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/20 transition"
                  />
                  <p className="text-[10px] text-muted-foreground">Month, day, day-of-week, and week are derived automatically</p>
                </div>

                {/* Category */}
                <div className="space-y-1.5">
                  <label htmlFor="predict-category" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Tag className="h-3.5 w-3.5" /> Product Category
                  </label>
                  <select
                    id="predict-category"
                    value={form.category}
                    onChange={(e) => setField("category", e.target.value)}
                    required
                    className="w-full rounded-xl border border-border bg-secondary/30 px-4 py-2.5 text-sm text-foreground focus:border-[var(--gold)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/20 transition"
                  >
                    <option value="">— Select category —</option>
                    {labels.categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Gold Rate */}
                <div className="space-y-1.5">
                  <label htmlFor="predict-goldrate" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Coins className="h-3.5 w-3.5" /> Gold Rate (₹/gram, 22K)
                  </label>
                  <input
                    id="predict-goldrate"
                    type="number"
                    min="1000"
                    max="20000"
                    step="1"
                    value={form.gold_rate}
                    onChange={(e) => setField("gold_rate", Number(e.target.value))}
                    required
                    className="w-full rounded-xl border border-border bg-secondary/30 px-4 py-2.5 text-sm text-foreground focus:border-[var(--gold)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/20 transition"
                  />
                </div>

                {/* Festival */}
                <div className="space-y-1.5">
                  <label htmlFor="predict-festival" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <PartyPopper className="h-3.5 w-3.5" /> Festival / Occasion
                  </label>
                  <select
                    id="predict-festival"
                    value={form.festival}
                    onChange={(e) => setField("festival", e.target.value)}
                    className="w-full rounded-xl border border-border bg-secondary/30 px-4 py-2.5 text-sm text-foreground focus:border-[var(--gold)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/20 transition"
                  >
                    {labels.festivals.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                {/* Wedding Season toggle */}
                <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/20 px-4 py-3">
                  <label htmlFor="predict-wedding" className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <Heart className="h-4 w-4 text-rose-400" /> Wedding Season
                  </label>
                  <button
                    id="predict-wedding"
                    type="button"
                    role="switch"
                    aria-checked={form.wedding_season === 1}
                    onClick={() => setField("wedding_season", form.wedding_season === 1 ? 0 : 1)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      form.wedding_season === 1 ? "bg-[var(--gold)]" : "bg-secondary"
                    }`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      form.wedding_season === 1 ? "translate-x-5" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>

                {/* Stock & Previous Sales */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="predict-stock" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <Package className="h-3.5 w-3.5" /> Current Stock
                    </label>
                    <input
                      id="predict-stock"
                      type="number"
                      min="0"
                      step="1"
                      value={form.current_stock}
                      onChange={(e) => setField("current_stock", Number(e.target.value))}
                      required
                      className="w-full rounded-xl border border-border bg-secondary/30 px-4 py-2.5 text-sm text-foreground focus:border-[var(--gold)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/20 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="predict-prevsales" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <TrendingUp className="h-3.5 w-3.5" /> Previous Sales
                    </label>
                    <input
                      id="predict-prevsales"
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.previous_sales}
                      onChange={(e) => setField("previous_sales", Number(e.target.value))}
                      required
                      className="w-full rounded-xl border border-border bg-secondary/30 px-4 py-2.5 text-sm text-foreground focus:border-[var(--gold)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/20 transition"
                    />
                  </div>
                </div>

                {/* Submit */}
                <button
                  id="predict-submit"
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl gold-gradient py-3 text-sm font-semibold text-navy shadow-lg transition hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Running model…</>
                  ) : (
                    <><Brain className="h-4 w-4" /> Predict Demand <ChevronRight className="h-4 w-4" /></>
                  )}
                </button>
              </form>
            </CardContent>
          </Card>

          {/* Result panel */}
          <div className="flex flex-col gap-4">
            {result ? (
              <ResultCard result={result} />
            ) : (
              <div className="flex-1 grid place-items-center rounded-3xl border border-dashed border-border/50 bg-secondary/10 min-h-[260px]">
                <div className="text-center space-y-2">
                  <Brain className="mx-auto h-10 w-10 text-[var(--gold)]/40" />
                  <p className="text-sm text-muted-foreground">Your prediction will appear here</p>
                  <p className="text-xs text-muted-foreground/60">Fill the form and click Predict Demand</p>
                </div>
              </div>
            )}

            {history.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Predictions</p>
                  <p className="font-serif text-2xl font-semibold">{history.length}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Avg. Demand</p>
                  <p className="font-serif text-2xl font-semibold text-[var(--gold)]">
                    {(history.reduce((s, h) => s + (h.predicted_demand ?? 0), 0) / history.length).toFixed(1)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}



      {/* ── TAB: HISTORY ─────────────────────────────────────────────────── */}
      {activeTab === "history" && (
        <Card className="luxe-card rounded-3xl border-border/60">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-[var(--gold)]" /> Prediction History
              <span className="ml-auto text-xs font-normal text-muted-foreground">Last 30 predictions</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HistoryTable items={history} />
          </CardContent>
        </Card>
      )}

      {/* ── TAB: CHARTS ──────────────────────────────────────────────────── */}
      {activeTab === "charts" && (
        <div className="grid gap-6">
          {/* Demand Trend */}
          <Card className="luxe-card rounded-3xl border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="h-4 w-4 text-[var(--gold)]" /> Demand Trend (Last 30 Predictions)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chartData && chartData.demand_trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartData.demand_trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C8A96E" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#C8A96E" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", fontSize: "12px" }}
                      formatter={(v: number) => [v.toFixed(1), "Demand"]}
                    />
                    <Area type="monotone" dataKey="demand" stroke="#C8A96E" strokeWidth={2} fill="url(#demandGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-40 place-items-center text-sm text-muted-foreground">
                  Run at least one prediction to see the trend.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6">
            {/* By Category */}
            <Card className="luxe-card rounded-3xl border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Tag className="h-4 w-4 text-[var(--gold)]" /> Demand by Category
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartData && chartData.by_category.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData.by_category} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="category" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", fontSize: "12px" }}
                        formatter={(v: number) => [v.toFixed(1), "Demand"]}
                      />
                      <Bar dataKey="demand" radius={[6, 6, 0, 0]}>
                        {(chartData.by_category).map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="grid h-40 place-items-center text-sm text-muted-foreground">No data yet.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
