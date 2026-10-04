import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtINR } from "@/lib/mock-data";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Plus, Trash2, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { useOwnerProfile } from "@/hooks/use-owner-profile";
import { getExpenses, addExpense, deleteExpense, getBills } from "@/lib/api-service";
import type { Expense } from "@/lib/firebase-types";

export const Route = createFileRoute("/_app/expenses")({
  component: ExpensesPage,
  head: () => ({ meta: [{ title: "Expenses · JewelMind AI" }] }),
});

const EXPENSE_TYPES = [
  "Gold Purchase", "Staff Salary", "Electricity", "Rent",
  "Marketing", "GST / Tax", "Miscellaneous", "Other",
];
const ALERT_THRESHOLD = 0.6;

function ExpensesPage() {
  const [items, setItems] = useState<Expense[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [expenseType, setExpenseType] = useState("");
  const [customType, setCustomType] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getExpenses(), getBills()]).then(([exp, bills]) => {
      if (!active) return;
      setItems(exp);
      setRevenue(bills.reduce((s, b) => s + b.amount, 0));
      setLoadError("");
      setFetching(false);
    }).catch((error: Error) => {
      if (!active) return;
      setLoadError(error.message || "Unable to load expenses from the server.");
      toast.error(`Could not load expenses: ${error.message}`);
      setFetching(false);
    });
    return () => { active = false; };
  }, []);

  const total = useMemo(() => items.reduce((s, e) => s + e.amount, 0), [items]);
  const profit = revenue - total;
  const ratio = revenue > 0 ? total / revenue : 0;
  const overBudget = ratio > ALERT_THRESHOLD;

  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((e) => map.set(e.expenseType, (map.get(e.expenseType) ?? 0) + e.amount));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [items]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const type = expenseType === "Other" ? customType.trim() : expenseType;
    if (!type || !amount || Number(amount) <= 0) {
      toast.error("Enter a category and a positive amount");
      return;
    }
    setLoading(true);
    try {
      const newExp: Omit<Expense, "id"> = {
        expenseType: type,
        amount: Number(amount),
        date,
        notes: notes.trim() || undefined,
      };
      await addExpense(newExp);
      setExpenseType("");
      setCustomType("");
      setAmount("");
      setNotes("");
      try {
        setItems(await getExpenses());
        setLoadError("");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown API error";
        setLoadError(`Expense saved, but the list could not refresh: ${message}`);
        toast.error(`Expense saved, but the list could not refresh: ${message}`);
        return;
      }
      toast.success("Expense added");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown API error";
      toast.error(`Failed to save expense: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteExpense(id);
      try {
        setItems(await getExpenses());
        setLoadError("");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown API error";
        setLoadError(`Expense deleted, but the list could not refresh: ${message}`);
        toast.error(`Expense deleted, but the list could not refresh: ${message}`);
        return;
      }
      toast.success("Expense removed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown API error";
      toast.error(`Failed to delete expense: ${message}`);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Expense Tracker"
        description="Record your shop's expenses. Profit is automatically calculated from your sales revenue."
      />

      {overBudget && (
        <Card className="luxe-card flex items-start gap-3 rounded-3xl border-rose-300/70 bg-rose-50/70 p-5 text-rose-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>
            <div className="font-serif text-lg font-semibold">Expenses are too high</div>
            <p className="mt-1 text-sm text-rose-900/80">
              You've spent <strong>{fmtINR(total)}</strong> — that's <strong>{Math.round(ratio * 100)}%</strong> of your
              total revenue ({fmtINR(revenue)}). The healthy ceiling is 60%.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="luxe-card rounded-3xl border-border/60 p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Revenue</div>
          <div className="mt-2 font-serif text-2xl">{fmtINR(revenue)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Sum of all bills</div>
        </Card>
        <Card className="luxe-card rounded-3xl border-border/60 p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Expenses</div>
          <div className={`mt-2 font-serif text-2xl ${overBudget ? "text-rose-700" : "text-amber-700"}`}>{fmtINR(total)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{revenue > 0 ? `${Math.round(ratio * 100)}% of revenue` : "No revenue yet"}</div>
        </Card>
        <Card className="luxe-card rounded-3xl border-border/60 p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Profit</div>
          <div className={`mt-2 font-serif text-2xl ${profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmtINR(profit)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Revenue − Expenses</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Add Form */}
        <Card className="luxe-card rounded-3xl border-border/60 p-5 lg:col-span-1">
          <h3 className="mb-4 font-serif text-xl">Add Expense</h3>
          <form onSubmit={handleAdd} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Expense Type</Label>
              <Select value={expenseType} onValueChange={setExpenseType}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {expenseType === "Other" && (
              <div className="grid gap-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Custom Type</Label>
                <Input value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="Enter type…" className="rounded-xl" />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Amount (₹)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="0"
                className="rounded-xl"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes…" className="rounded-xl" />
            </div>
            <Button type="submit" disabled={loading} className="mt-1 rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90">
              <Plus className="mr-1 h-4 w-4" /> {loading ? "Saving…" : "Add Expense"}
            </Button>
          </form>
        </Card>

        {/* Breakdown Chart */}
        <Card className="luxe-card rounded-3xl border-border/60 p-5 lg:col-span-2">
          <h3 className="mb-4 font-serif text-xl">Breakdown</h3>
          {chartData.length === 0 ? (
            <div className="grid h-[260px] place-items-center text-sm text-muted-foreground">
              <div className="text-center">
                <PackageOpen className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
                No expenses recorded. Add your first one on the left.
              </div>
            </div>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer>
                <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E2D6" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={120} />
                  <Tooltip formatter={(v: number) => fmtINR(v)} contentStyle={{ borderRadius: 16 }} />
                  <Bar dataKey="value" fill="#D4A017" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* All Entries */}
      <Card className="luxe-card rounded-3xl border-border/60 p-0">
        <div className="border-b border-border/60 px-5 py-4 font-serif text-lg">All Entries</div>
        {fetching ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading expenses…</div>
        ) : loadError ? (
          <div className="p-12 text-center text-sm text-destructive">{loadError}</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No expenses recorded.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>{["Date", "Category", "Amount", "Notes", ""].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-t border-border/60">
                  <td className="px-4 py-3 text-muted-foreground">{e.date}</td>
                  <td className="px-4 py-3 font-medium">{e.expenseType}</td>
                  <td className="px-4 py-3">{fmtINR(e.amount)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.notes ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(e.id)} className="text-rose-600 hover:opacity-80">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
