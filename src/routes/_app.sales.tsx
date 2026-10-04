import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { fmtINR } from "@/lib/mock-data";
import { useEffect, useState } from "react";
import { PackageOpen } from "lucide-react";
import { getBills } from "@/lib/api-service";
import type { Bill } from "@/lib/firebase-types";

export const Route = createFileRoute("/_app/sales")({
  component: SalesPage,
  head: () => ({ meta: [{ title: "Sales Analytics · JewelMind AI" }] }),
});

function SalesPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    getBills().then((b) => {
      if (!active) return;
      setBills(b);
      setLoadError("");
      setLoading(false);
    }).catch((error: Error) => {
      if (!active) return;
      setLoadError(error.message || "Unable to load sales from the server.");
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const totalRevenue = bills.reduce((s, b) => s + b.amount, 0);
  const avgOrder = bills.length > 0 ? Math.round(totalRevenue / bills.length) : 0;
  const hasSales = bills.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Insights" title="Sales Analytics" description="Revenue summary and transaction records across your business." />
      {loadError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Sales data could not be loaded: {loadError}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Total Revenue", hasSales ? fmtINR(totalRevenue) : "₹0"],
          ["Avg. Order Value", hasSales ? fmtINR(avgOrder) : "₹0"],
          ["Total Bills", String(bills.length)],
        ].map(([l, v]) => (
          <Card key={l} className="luxe-card rounded-3xl border-border/60 p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{l}</div>
            <div className="mt-2 font-serif text-2xl font-semibold">{v}</div>
            {!hasSales && <div className="mt-1 text-xs text-muted-foreground">No sales available.</div>}
          </Card>
        ))}
      </div>

      <Card className="luxe-card rounded-3xl border-border/60 p-0">
        <div className="border-b border-border/60 px-5 py-4 font-serif text-lg">All Sales Transactions</div>
        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading sales…</div>
        ) : loadError ? (
          <div className="p-12 text-center text-sm text-destructive">{loadError}</div>
        ) : bills.length === 0 ? (
          <div className="p-12 text-center">
            <PackageOpen className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No sales recorded yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">Add your first bill to see transactions here.</p>
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
                {bills.map((b) => (
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

