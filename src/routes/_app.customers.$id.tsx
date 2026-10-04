import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Mail, MapPin, Phone, Cake, Calendar, Loader2, Send, Sparkles, PackageOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fmtINR, fmtDate } from "@/lib/mock-data";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useOwnerProfile } from "@/hooks/use-owner-profile";
import { getCustomer, getBillsForCustomer, sendWhatsAppToCustomer } from "@/lib/api-service";
import type { Customer } from "@/lib/firebase-types";
import type { Bill } from "@/lib/firebase-types";

export const Route = createFileRoute("/_app/customers/$id")({
  component: CustomerDetailsPage,
  head: () => ({ meta: [{ title: "Customer · JewelMind AI" }] }),
});

function CustomerDetailsPage() {
  const { id } = Route.useParams();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [year, setYear] = useState<string>("all");
  const [cat, setCat] = useState<string>("all");
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [whatsappSending, setWhatsappSending] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getCustomer(id), getBillsForCustomer(id)]).then(([c, b]) => {
      if (!active) return;
      setCustomer(c);
      setBills(b);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { active = false; };
  }, [id]);

  const sortedBills = useMemo(
    () => [...bills].sort((a, b) => a.date.localeCompare(b.date)),
    [bills]
  );

  const filtered = useMemo(() => sortedBills.filter((p) => {
    if (filter === "full" && p.paymentStatus !== "Full") return false;
    if (filter === "partial" && p.paymentStatus !== "Partial") return false;
    if (year !== "all" && !p.date.startsWith(year)) return false;
    if (cat !== "all" && p.category !== cat) return false;
    return true;
  }), [sortedBills, filter, year, cat]);

  const years = Array.from(new Set(bills.map((p) => p.date.slice(0, 4)))).sort();
  const cats = Array.from(new Set(bills.map((p) => p.category)));
  const trend = sortedBills.map((p) => ({ date: fmtDate(p.date), amount: p.amount }));
  const ltv = bills.reduce((s, b) => s + b.amount, 0);
  const pendingBalance = bills.reduce((s, b) => s + b.balanceAmount, 0);
  const lastBill = bills.length > 0 ? [...bills].sort((a, b) => b.date.localeCompare(a.date))[0] : null;

  const favCategory = useMemo(() => {
    const tally: Record<string, number> = {};
    bills.forEach((b) => { tally[b.category] = (tally[b.category] || 0) + b.amount; });
    return Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  }, [bills]);

  async function handleSendWhatsApp(e: React.FormEvent) {
    e.preventDefault();
    if (!customer || !whatsappMessage.trim()) {
      toast.error("Please enter a message");
      return;
    }

    setWhatsappSending(true);
    try {
      await sendWhatsAppToCustomer(customer.id, whatsappMessage.trim());
      toast.success("✅ Message Sent Successfully");
      setWhatsappOpen(false);
      setWhatsappMessage("");
    } catch {
      toast.error("❌ Failed to send message.");
    } finally {
      setWhatsappSending(false);
    }
  }

  if (loading) {
    return <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!customer) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="text-center">
          <p className="text-muted-foreground">Customer not found.</p>
          <Link to="/customers" className="mt-4 inline-flex items-center gap-1.5 text-sm text-[var(--gold)] hover:underline">
            ← Back to Customers
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Customers
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl gold-gradient text-2xl font-semibold text-navy">
            {customer.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--gold)]">Customer</div>
            <h1 className="font-serif text-3xl font-semibold">{customer.name}</h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {customer.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{customer.phone}</span>}
              {customer.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{customer.email}</span>}
              {customer.city && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{customer.city}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-2xl" onClick={() => setWhatsappOpen(true)}>
            <Send className="mr-1.5 h-4 w-4" />WhatsApp
          </Button>
          <Button className="rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90"><Sparkles className="mr-1.5 h-4 w-4" />AI Insights</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <StatTile label="Lifetime Value" value={fmtINR(ltv)} />
        <StatTile label="Pending Balance" value={fmtINR(pendingBalance)} tone={pendingBalance > 0 ? "warn" : "default"} />
        <StatTile label="Last Purchase" value={lastBill ? fmtDate(lastBill.date) : "—"} />
        <StatTile label="Favorite Category" value={favCategory} />
        <StatTile label="Total Visits" value={String(customer.visits)} />
      </div>

      <Tabs defaultValue="history" className="space-y-5">
        <TabsList className="rounded-2xl bg-secondary">
          <TabsTrigger value="profile" className="rounded-xl">Profile</TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl">Purchase History</TabsTrigger>
          <TabsTrigger value="payments" className="rounded-xl">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="luxe-card grid gap-4 rounded-3xl border-border/60 p-6 md:grid-cols-2">
            <Info label="Name" value={customer.name} />
            <Info label="Phone" value={customer.phone || "—"} />
            <Info label="Email" value={customer.email || "—"} />
            <Info label="Date of Birth" value={fmtDate(customer.dob)} icon={<Cake className="h-4 w-4" />} />
            <Info label="Address" value={customer.address ? `${customer.address}, ${customer.city}` : customer.city || "—"} />
            <Info label="Customer Since" value={fmtDate(customer.customerSince)} icon={<Calendar className="h-4 w-4" />} />
            <Info label="Lifetime Value" value={fmtINR(ltv)} />
            <Info label="Total Visits" value={String(customer.visits)} />
            <Info label="Pending Balance" value={fmtINR(pendingBalance)} />
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-5">
          <Card className="luxe-card rounded-3xl border-border/60 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-serif text-xl">Spending Trend</h3>
              <span className="text-xs text-muted-foreground">{bills.length} purchases</span>
            </div>
            <div className="h-[220px]">
              {bills.length === 0 ? (
                <div className="grid h-full place-items-center">
                  <div className="text-center">
                    <PackageOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No purchases recorded yet.</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend}>
                    <defs>
                      <linearGradient id="cust-trend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D4A017" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#D4A017" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E2D6" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#5B6478", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `${(v / 100000).toFixed(1)}L`} tick={{ fill: "#5B6478", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => fmtINR(v)} contentStyle={{ borderRadius: 16 }} />
                    <Area type="monotone" dataKey="amount" stroke="#D4A017" strokeWidth={2.5} fill="url(#cust-trend)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            {[{ k: "all", label: "All" }, { k: "full", label: "Full Payment" }, { k: "partial", label: "Partial Payment" }].map((f) => (
              <button
                key={f.k}
                onClick={() => setFilter(f.k)}
                className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${filter === f.k ? "border-[var(--gold)] bg-[var(--gold)] text-navy" : "border-border bg-card text-foreground hover:border-[var(--gold)]/50"}`}
              >{f.label}</button>
            ))}
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="ml-2 w-32 rounded-full"><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger className="w-44 rounded-full"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {cats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchases match these filters.</p>
          ) : (
            <div className="relative space-y-4 pl-6">
              <div className="absolute left-[11px] top-2 h-[calc(100%-1rem)] w-px bg-gradient-to-b from-[var(--gold)]/60 via-border to-transparent" />
              {filtered.map((p, idx) => (
                <div key={p.id} className="relative">
                  <div className="absolute -left-[19px] top-5 h-3 w-3 rounded-full border-2 border-[var(--gold)] bg-background" />
                  <Card className="luxe-card rounded-3xl border-border/60 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--gold)]">Purchase #{idx + 1} · {fmtDate(p.date)}</div>
                        <h4 className="mt-1 font-serif text-xl">{p.productName}</h4>
                        <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
                          <span>{p.category}</span><span>·</span><span>{p.purity}</span><span>·</span><span>{p.weight}g</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-serif text-2xl font-semibold">{fmtINR(p.amount)}</div>
                        <Badge variant="outline" className={p.paymentStatus === "Full" ? "mt-1 border-emerald-200 bg-emerald-50 text-emerald-700" : "mt-1 border-amber-200 bg-amber-50 text-amber-700"}>
                          Payment: {p.paymentStatus}
                        </Badge>
                      </div>
                    </div>
                    {p.paymentStatus === "Partial" && (
                      <div className="mt-4 grid gap-3 rounded-2xl bg-secondary/60 p-4 text-sm md:grid-cols-3">
                        <div><div className="text-xs text-muted-foreground">Paid</div><div className="font-medium">{fmtINR(p.paidAmount)}</div></div>
                        <div><div className="text-xs text-muted-foreground">Balance</div><div className="font-medium text-amber-700">{fmtINR(p.balanceAmount)}</div></div>
                        <div><div className="text-xs text-muted-foreground">Due Date</div><div className="font-medium">{fmtDate(p.dueDate)}</div></div>
                      </div>
                    )}
                  </Card>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments">
          <Card className="luxe-card rounded-3xl border-border/60 p-6">
            <h3 className="mb-4 font-serif text-xl">Payment Ledger</h3>
            {bills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr><th className="py-2">Date</th><th>Product</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {sortedBills.map((p) => (
                    <tr key={p.id} className="border-t border-border/60">
                      <td className="py-3">{fmtDate(p.date)}</td>
                      <td>{p.productName}</td>
                      <td>{fmtINR(p.amount)}</td>
                      <td>{fmtINR(p.paidAmount)}</td>
                      <td className={p.balanceAmount > 0 ? "text-amber-700" : ""}>{fmtINR(p.balanceAmount)}</td>
                      <td>{p.paymentStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={whatsappOpen}
        onOpenChange={(open) => {
          setWhatsappOpen(open);
          if (!open) setWhatsappMessage("");
        }}
      >
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Send WhatsApp</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSendWhatsApp} className="grid gap-4">
            <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Recipient</div>
              <div className="mt-1 font-medium">{customer.name}</div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Message</Label>
              <Textarea
                value={whatsappMessage}
                onChange={(e) => setWhatsappMessage(e.target.value)}
                placeholder="Type your WhatsApp message..."
                rows={5}
                maxLength={1024}
                className="resize-none rounded-xl"
              />
              <div className="text-right text-[11px] text-muted-foreground">{whatsappMessage.length}/1024</div>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setWhatsappOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={whatsappSending || !whatsappMessage.trim()}
                className="rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90"
              >
                {whatsappSending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-1.5 h-4 w-4" /> Send
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return (
    <Card className={`luxe-card rounded-3xl border-border/60 p-5 ${tone === "warn" ? "ring-1 ring-amber-200" : ""}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 font-serif text-xl font-semibold">{value}</div>
    </Card>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 inline-flex items-center gap-1.5 font-medium">{icon}{value}</div>
    </div>
  );
}
