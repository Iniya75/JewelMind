import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar, BarChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtINR } from "@/lib/mock-data";
import {
  ArrowUpRight, IndianRupee, AlertCircle,
  Users, Coins, Calendar, PackageOpen,
} from "lucide-react";
import { useOwnerProfile } from "@/hooks/use-owner-profile";
import { getBills, getExpenses, getCustomers, getGoldRates, computeDashboardMetrics } from "@/lib/api-service";
import type { Bill, Expense, GoldRate } from "@/lib/firebase-types";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard · JewelMind AI" }] }),
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function KpiCard({
  label, value, sub, icon: Icon, tone = "neutral",
}: {
  label: string; value: string; sub: string; icon: any; tone?: "up" | "down" | "neutral";
}) {
  return (
    <Card className="luxe-card rounded-3xl border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-foreground">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 font-serif text-2xl font-semibold text-foreground">{value}</div>
        <div className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
          tone === "up" ? "text-emerald-700" : tone === "down" ? "text-rose-600" : "text-muted-foreground"
        }`}>
          {tone !== "neutral" && <ArrowUpRight className={`h-3.5 w-3.5 ${tone === "down" ? "rotate-90" : ""}`} />}
          {sub}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="text-center">
        <PackageOpen className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function Dashboard() {
  const { ownerName } = useOwnerProfile();
  const [bills, setBills] = useState<Bill[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [goldRates, setGoldRates] = useState<GoldRate[]>([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    async function initData() {
      try {
        const [b, e, c, g] = await Promise.all([
          getBills(),
          getExpenses(),
          getCustomers(),
          getGoldRates(),
        ]);
        if (!active) return;
        setBills(b);
        setExpenses(e);
        setCustomerCount(c.length);
        setGoldRates(g);
        setLoadError("");
      } catch (error) {
        if (active) {
          const message = error instanceof Error ? error.message : "Unknown API error";
          setLoadError(message || "Unable to load dashboard data from the server.");
          setBills([]);
          setExpenses([]);
          setCustomerCount(0);
          setGoldRates([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    initData();
    return () => { active = false; };
  }, []);

  const metrics = computeDashboardMetrics(bills, expenses, goldRates);

  // Build daily sales for this week
  const nowDate = new Date();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekStart = new Date(nowDate);
  weekStart.setDate(nowDate.getDate() - nowDate.getDay());
  const dailyMap = new Map<string, number>();
  bills.forEach((b) => {
    const d = new Date(b.date);
    if (d >= weekStart) {
      const dayKey = days[d.getDay()];
      dailyMap.set(dayKey, (dailyMap.get(dayKey) ?? 0) + (b.amount ?? 0));
    }
  });
  const dailySalesData = days.map((d) => ({ d, v: dailyMap.get(d) ?? 0 }));
  const hasWeeklySales = dailySalesData.some((x) => x.v > 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Today · ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}`}
        title={`${greeting()}, ${ownerName}`}
        description="Your boutique at a glance — sales, customers, and market signals in one place."
        actions={
          <button className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90">
            <Calendar className="h-4 w-4" /> This Week
          </button>
        }
      />
      {loadError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Dashboard data could not be loaded: {loadError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Today's Sales"
          value={fmtINR(metrics.todaySales ?? 0)}
          sub={(metrics.todaySales ?? 0) === 0 ? "No sales recorded yet." : "Today"}
          icon={IndianRupee}
          tone="neutral"
        />
        <KpiCard
          label="Pending Payments"
          value={fmtINR(metrics.pendingPayments ?? 0)}
          sub={(metrics.pendingPayments ?? 0) === 0 ? "No pending dues." : "Outstanding balance"}
          icon={AlertCircle}
          tone={(metrics.pendingPayments ?? 0) > 0 ? "down" : "neutral"}
        />
        <KpiCard
          label="Customers"
          value={String(customerCount)}
          sub={customerCount === 0 ? "No customer records." : `${customerCount} registered`}
          icon={Users}
          tone="neutral"
        />
        <KpiCard
          label="22K Gold Rate (Live)"
          value={metrics.latestGold ? `₹${metrics.latestGold.rate22k.toLocaleString("en-IN")}/g` : "—"}
          sub={metrics.latestGold ? "Auto-fetched via API" : "Fetching API rate..."}
          icon={Coins}
          tone="up"
        />
      </div>

      {/* Daily Sales */}
      <Card className="luxe-card rounded-3xl border-border/60">
        <CardHeader><CardTitle className="font-serif text-xl">Daily Sales · This Week</CardTitle></CardHeader>
        <CardContent className="h-[320px]">
          {!hasWeeklySales ? (
            <EmptyChart message="No sales this week. Add bills to see daily trends." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailySalesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E2D6" vertical={false} />
                <XAxis dataKey="d" tick={{ fill: "#5B6478", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fill: "#5B6478", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => fmtINR(v)} contentStyle={{ borderRadius: 16 }} />
                <Bar dataKey="v" fill="#D4A017" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card className="luxe-card rounded-3xl border-border/60 p-0">
        <div className="border-b border-border/60 px-5 py-4 font-serif text-lg">Recent Transactions</div>
        {bills.length === 0 ? (
          <div className="p-12 text-center">
            <PackageOpen className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No recent transactions.</p>
            <p className="mt-1 text-xs text-muted-foreground">Add your first bill to start tracking revenue.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  {["Bill No.", "Customer", "Category", "Weight", "Amount", "Status", "Date"].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bills.slice(0, 10).map((b) => (
                  <tr key={b.id} className="border-t border-border/60 hover:bg-secondary/30 transition">
                    <td className="px-4 py-3 font-medium">{b.billNumber}</td>
                    <td className="px-4 py-3">{b.customerName}</td>
                    <td className="px-4 py-3">{b.category}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{b.weight}g</td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-[var(--gold)]">{fmtINR(b.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        b.paymentStatus === "Full"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>{b.paymentStatus}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {new Date(b.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
