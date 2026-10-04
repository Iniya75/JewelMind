import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Printer,
  Download,
  Share2,
  Sparkles,
  Plus,
  PackageOpen,
  Loader2,
  Trash2,
  BadgeIndianRupee,
  TrendingUp,
  AlertCircle,
  User,
  Diamond,
  CreditCard,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { fmtDate, fmtINR, JEWELRY_CATEGORIES } from "@/lib/mock-data";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useOwnerProfile } from "@/hooks/use-owner-profile";
import {
  getBills,
  getCustomers,
  getProducts,
  getLatestGoldRate,
} from "@/lib/api-service";
import type { Bill, Customer } from "@/lib/firebase-types";

export const Route = createFileRoute("/_app/billing")({
  component: BillingPage,
  head: () => ({ meta: [{ title: "Billing & Invoices · JewelMind AI" }] }),
});

const PURITIES = ["22K", "24K", "18K", "14K", "925 Silver", "Other"];
const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Cheque", "NEFT/RTGS"];

interface ItemRow {
  productId: string;
  productName: string;
  category: string;
  purity: string;
  quantity: number;
  weight: number;
  makingCharge: number;
  stoneCharge: number;
  discount: number;
  gstPercent: number;
}

function newItemRow(): ItemRow {
  return {
    productId: "",
    productName: "",
    category: "Gold Chains",
    purity: "22K",
    quantity: 1,
    weight: 0,
    makingCharge: 0,
    stoneCharge: 0,
    discount: 0,
    gstPercent: 3.0,
  };
}

function calcItem(item: ItemRow, goldRate: number) {
  const goldValue = item.weight * item.quantity * goldRate;
  const makingTotal = item.makingCharge * item.quantity;
  const stoneTotal = item.stoneCharge * item.quantity;
  const subtotal = Math.max(goldValue + makingTotal + stoneTotal - item.discount, 0);
  const gstAmount = (subtotal * item.gstPercent) / 100;
  const total = subtotal + gstAmount;
  return { goldValue, makingTotal, stoneTotal, subtotal, gstAmount, total };
}

function BillingPage() {
  const { shopName, gstin, phone, address } = useOwnerProfile();
  const [bills, setBills] = useState<Bill[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Array<{
    id: string;
    sku: string;
    name: string;
    category: string | null;
    purity: string | null;
    weight: number | null;
    stockQuantity: number;
  }>>([]);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("create");
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [goldRate, setGoldRate] = useState<{ rate22k: number; rate24k: number; rateSilver: number } | null>(null);
  const [goldRateLoading, setGoldRateLoading] = useState(true);

  // ── Form state ──────────────────────────────────────────────────────────
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentStatus, setPaymentStatus] = useState<"Full" | "Partial" | "Pending">("Full");
  const [paidAmount, setPaidAmount] = useState<number | "">("");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<ItemRow[]>([newItemRow()]);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getBills(), getCustomers(), getProducts()]).then(([b, c, p]) => {
      if (!active) return;
      setBills(b);
      setCustomers(c);
      setProducts(p);
      setLoadError("");
      if (b.length > 0) setSelectedBillId(b[0].id);
      setFetching(false);
    }).catch((error: Error) => {
      if (!active) return;
      setLoadError(error.message || "Unable to load billing data from the server.");
      setFetching(false);
      toast.error(`Could not load billing data: ${error.message}`);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setGoldRateLoading(true);
    async function loadGoldRate() {
      try {
        const rate = await getLatestGoldRate();
        setGoldRate(rate);
      } catch {
        setGoldRate(null);
      } finally {
        setGoldRateLoading(false);
      }
    }
    loadGoldRate();
  }, []);

  const selectedBill = bills.find((b) => b.id === selectedBillId) ?? null;

  // ── Item helpers ────────────────────────────────────────────────────────
  function updateItem<K extends keyof ItemRow>(idx: number, field: K, value: ItemRow[K]) {
    setItems(arr => arr.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }

  function selectInventoryProduct(idx: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    setItems((rows) => rows.map((item, i) => {
      if (i !== idx) return item;
      if (!product) return { ...item, productId: "" };
      return {
        ...item,
        productId: product.id,
        productName: product.name,
        category: product.category || item.category,
        purity: product.purity || item.purity,
        weight: Number(product.weight || 0),
      };
    }));
  }

  function removeItem(idx: number) {
    setItems(arr => arr.length > 1 ? arr.filter((_, i) => i !== idx) : arr);
  }

  // ── Totals computation ──────────────────────────────────────────────────
  function getEffectiveRate(purity: string): number {
    if (!goldRate) return 0;
    const p = purity.toLowerCase();
    if (p.startsWith("24")) return goldRate.rate24k;
    if (p.startsWith("22")) return goldRate.rate22k;
    if (p.startsWith("18")) return Math.round(goldRate.rate24k * 18 / 24);
    if (p.startsWith("14")) return Math.round(goldRate.rate24k * 14 / 24);
    if (p.includes("silver") || p.includes("925")) return goldRate.rateSilver;
    return goldRate.rate22k;
  }

  const computedItems = items.map(it => ({
    ...it,
    ...calcItem(it, getEffectiveRate(it.purity)),
  }));

  const grandSubtotal = computedItems.reduce((s, i) => s + i.subtotal, 0);
  const grandGst = computedItems.reduce((s, i) => s + i.gstAmount, 0);
  const grandTotal = computedItems.reduce((s, i) => s + i.total, 0);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleAddBill(e: React.FormEvent) {
    e.preventDefault();

    const effectiveName = customerId
      ? (customers.find(c => c.id === customerId)?.name ?? customerName.trim())
      : customerName.trim();

    if (!effectiveName) {
      toast.error("Please enter or select a customer name");
      return;
    }
    for (const [idx, it] of items.entries()) {
      if (!it.productName.trim()) {
        toast.error(`Item ${idx + 1}: Product name is required`);
        return;
      }
      if (!it.category) {
        toast.error(`Item ${idx + 1}: Category is required`);
        return;
      }
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("access_token") || "";

      const payload = {
        customerName: effectiveName,
        customerId: customerId || undefined,
        phoneNumber: phoneNumber || undefined,
        paymentMethod,
        paymentStatus,
        paidAmount: paymentStatus === "Full"
          ? grandTotal
          : paymentStatus === "Partial"
            ? (paidAmount === "" ? 0 : Number(paidAmount))
            : 0,
        dueDate: dueDate || undefined,
        items: computedItems.map(it => ({
          productId: it.productId || undefined,
          productName: it.productName,
          category: it.category,
          purity: it.purity,
          quantity: it.quantity,
          weight: it.weight,
          makingCharge: it.makingCharge,
          stoneCharge: it.stoneCharge,
          discount: it.discount,
          gstPercent: it.gstPercent,
          goldRate: getEffectiveRate(it.purity),
          goldValue: it.goldValue,
          subtotal: it.subtotal,
          gstAmount: it.gstAmount,
          total: it.total,
          price: it.total,
          rate: getEffectiveRate(it.purity),
        })),
      };

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.detail || `Server error (${res.status})`);
        return;
      }

      const created = data as Bill;
      setBills(arr => [created, ...arr]);
      setSelectedBillId(created.id);
      try {
        setProducts(await getProducts());
      } catch {
        toast.error("Invoice saved, but inventory could not be refreshed.");
      }
      
      // Reset form
      setCustomerId(""); setCustomerName(""); setPhoneNumber("");
      setPaymentMethod("Cash"); setPaymentStatus("Full");
      setPaidAmount(""); setDueDate("");
      setItems([newItemRow()]);

      // Switch to preview tab
      setActiveTab("history");
      toast.success(`🎉 Invoice ${created.billNumber || created.invoiceNumber} generated successfully!`);
    } catch (err: any) {
      toast.error(err.message || "Network error — could not reach server");
    } finally {
      setSaving(false);
    }
  }

  // ── PDF Download ──────────────────────────────────────────────────────────
  async function handleDownloadPDF() {
    if (!selectedBillId) return;
    setDownloading(true);
    try {
      const token = localStorage.getItem("access_token") || "";
      const res = await fetch(`/api/invoices/${selectedBillId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Failed to generate PDF");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const invoiceNum = selectedBill?.billNumber ?? selectedBill?.invoiceNumber ?? selectedBillId;
      a.href = url;
      a.download = `Invoice-${invoiceNum}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded!");
    } catch (err: any) {
      toast.error(err.message || "Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  }

  const previewGst = selectedBill ? Math.round((selectedBill.gst ?? selectedBill.amount * 0.03)) : 0;
  const previewTotal = selectedBill ? (selectedBill.totalAmount ?? selectedBill.amount + previewGst) : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <PageHeader
        eyebrow="Billing & POS"
        title="Billing System"
        description="Spacious, framed invoice generator with automated daily bullion rate calculations."
      />
      {loadError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Billing data could not be loaded: {loadError}
        </div>
      )}

      {/* Live Gold Rate Banner */}
      <div className={`flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm border shadow-sm ${
        goldRateLoading ? "bg-secondary/60 border-border/40" :
        goldRate ? "bg-amber-50/80 border-amber-300/80 dark:bg-amber-950/30 dark:border-amber-800/50" :
        "bg-red-50 border-red-200/60 dark:bg-red-950/20 dark:border-red-800/30"
      }`}>
        {goldRateLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> :
          goldRate ? <BadgeIndianRupee className="h-5 w-5 text-amber-600 flex-shrink-0" /> :
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
        }
        {goldRateLoading ? <span className="text-muted-foreground">Connecting to live bullion market…</span> :
          goldRate ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-amber-900 dark:text-amber-100">
              <span className="font-semibold flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" /> Live Bullion Rates:
              </span>
              <span><strong>22K Gold:</strong> {fmtINR(goldRate.rate22k)}/g</span>
              <span><strong>24K Gold:</strong> {fmtINR(goldRate.rate24k)}/g</span>
              <span><strong>Silver:</strong> {fmtINR(goldRate.rateSilver)}/g</span>
            </div>
          ) : (
            <span className="text-red-700 dark:text-red-300">
              Live gold rate unavailable. <a href="/gold-rates" className="underline font-bold">Configure API key →</a>
            </span>
          )
        }
      </div>

      {/* Main Mode Switcher Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <TabsList className="grid w-[420px] grid-cols-2 rounded-2xl bg-secondary p-1.5 h-13 border border-border/60">
            <TabsTrigger value="create" className="rounded-xl py-2.5 text-sm font-semibold transition data-[state=active]:bg-[var(--gold)] data-[state=active]:text-navy shadow-sm">
              <Plus className="mr-2 h-4 w-4 inline" /> Create New Bill
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-xl py-2.5 text-sm font-semibold transition data-[state=active]:bg-background shadow-sm">
              <FileText className="mr-2 h-4 w-4 inline" /> Invoice Archives ({bills.length})
            </TabsTrigger>
          </TabsList>

          {activeTab === "history" && selectedBill && (
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-xl h-10 px-4 font-medium" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" /> Print
              </Button>
              <Button variant="outline" className="rounded-xl h-10 px-4 font-medium" onClick={handleDownloadPDF} disabled={downloading}>
                {downloading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                {downloading ? "Generating…" : "Download PDF"}
              </Button>
            </div>
          )}
        </div>

        {/* ─── TAB 1: CREATE BILL FORM ───────────────────────────────────────── */}
        <TabsContent value="create" className="focus:outline-none">
          <form onSubmit={handleAddBill} className="space-y-6">
            
            {/* Frame 1: Customer Details */}
            <Card className="rounded-3xl border-2 border-border/80 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2.5 border-b border-border/60 pb-4 mb-5 text-base font-serif font-bold text-foreground">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--gold)]/20 text-[var(--gold)]">
                  <User className="h-4 w-4" />
                </div>
                <span>Step 1: Customer Information</span>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <div className="grid gap-2 md:col-span-1">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Customer Account</Label>
                  <Select value={customerId} onValueChange={v => { setCustomerId(v); setCustomerName(""); }}>
                    <SelectTrigger className="rounded-xl h-11 border-input bg-background text-sm font-medium">
                      <SelectValue placeholder="Choose registered customer…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">✨ Walk-in / Enter Details Manually</SelectItem>
                      {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.phone || "No phone"})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {!customerId ? (
                  <>
                    <div className="grid gap-2 md:col-span-1">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer Name *</Label>
                      <Input
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        placeholder="e.g. Ananya Sharma"
                        className="rounded-xl h-11 border-input bg-background text-sm font-medium"
                        required
                      />
                    </div>
                    <div className="grid gap-2 md:col-span-1">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Phone Number</Label>
                      <Input
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value)}
                        placeholder="e.g. 9876543210"
                        className="rounded-xl h-11 border-input bg-background text-sm font-medium"
                      />
                    </div>
                  </>
                ) : (
                  <div className="md:col-span-2 flex items-center rounded-2xl bg-secondary/40 px-5 py-3 border border-border/50 text-sm">
                    ✅ Selected Account: <strong className="ml-1.5 mr-3">{customers.find(c => c.id === customerId)?.name}</strong>
                    <span className="text-muted-foreground">({customers.find(c => c.id === customerId)?.phone || "No phone registered"})</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Frame 2: Jewelry Items List */}
            <Card className="rounded-3xl border-2 border-border/80 bg-card p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-border/60 pb-4 text-base font-serif font-bold text-foreground">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--gold)]/20 text-[var(--gold)]">
                    <Diamond className="h-4 w-4" />
                  </div>
                  <span>Step 2: Jewelry Items & Charges breakdown</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl h-9 px-4 text-xs font-bold border-[var(--gold)]/50 hover:bg-[var(--gold)]/10 text-[var(--gold)]"
                  onClick={() => setItems(arr => [...arr, newItemRow()])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Another Item
                </Button>
              </div>

              <div className="space-y-6">
                {items.map((it, idx) => {
                  const rate = getEffectiveRate(it.purity);
                  const calc = calcItem(it, rate);
                  return (
                    <div key={idx} className="rounded-2xl border-2 border-border/80 bg-secondary/15 p-5 space-y-5 relative shadow-inner">
                      <div className="flex items-center justify-between border-b border-border/40 pb-3">
                        <span className="inline-flex items-center rounded-md bg-[var(--navy)] text-white px-2.5 py-1 text-xs font-bold">
                          Item #{idx + 1}
                        </span>
                        {items.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(idx)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 h-8 px-2.5 rounded-lg text-xs font-semibold"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove Row
                          </Button>
                        )}
                      </div>

                      {/* Row 1: Names & Category */}
                      <div className="grid gap-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Inventory SKU (optional)</Label>
                        <Select
                          value={it.productId || "manual"}
                          onValueChange={(value) => selectInventoryProduct(idx, value === "manual" ? "" : value)}
                        >
                          <SelectTrigger className="rounded-xl h-11 border-input bg-background text-sm font-medium">
                            <SelectValue placeholder="Manual line item" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual line item</SelectItem>
                            {products.filter((product) => product.stockQuantity > 0).map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.sku} · {product.name} ({product.stockQuantity} in stock)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="grid gap-1.5 md:col-span-2">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Product Title / Description *</Label>
                          <Input
                            value={it.productName}
                            onChange={e => updateItem(idx, "productName", e.target.value)}
                            placeholder="e.g. Traditional Antique Gold Bangle (Set of 2)"
                            className="rounded-xl h-11 border-input bg-background text-sm font-medium"
                            required
                          />
                        </div>
                        <div className="grid gap-1.5 md:col-span-1">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category *</Label>
                          <Select value={it.category} onValueChange={v => updateItem(idx, "category", v)}>
                            <SelectTrigger className="rounded-xl h-11 border-input bg-background text-sm font-medium">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {JEWELRY_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Row 2: Purity, Qty, Weight, Applied Rate */}
                      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                        <div className="grid gap-1.5">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Metal Purity</Label>
                          <Select value={it.purity} onValueChange={v => updateItem(idx, "purity", v)}>
                            <SelectTrigger className="rounded-xl h-11 border-input bg-background text-sm font-semibold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PURITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quantity (Pcs)</Label>
                          <Input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={e => updateItem(idx, "quantity", Math.max(1, Number(e.target.value)))}
                            className="rounded-xl h-11 border-input bg-background text-sm font-semibold"
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Net Weight (Grams)</Label>
                          <Input
                            type="number"
                            step="0.001"
                            min={0}
                            value={it.weight || ""}
                            onChange={e => updateItem(idx, "weight", Number(e.target.value))}
                            placeholder="0.000"
                            className="rounded-xl h-11 border-input bg-background text-sm font-semibold text-[var(--gold)]"
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Live Rate Applied</Label>
                          <div className="rounded-xl h-11 border border-amber-400/50 bg-amber-100/40 dark:bg-amber-950/40 flex items-center px-3.5 text-sm font-bold text-amber-900 dark:text-amber-200">
                            {rate > 0 ? `${fmtINR(rate)}/g` : "₹0.00"}
                          </div>
                        </div>
                      </div>

                      {/* Row 3: Making, Stone, Discount */}
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div className="grid gap-1.5">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Making Charges (₹/pc)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={it.makingCharge || ""}
                            onChange={e => updateItem(idx, "makingCharge", Number(e.target.value))}
                            placeholder="e.g. 1500"
                            className="rounded-xl h-11 border-input bg-background text-sm font-medium"
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stone / Gem Charges (₹/pc)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={it.stoneCharge || ""}
                            onChange={e => updateItem(idx, "stoneCharge", Number(e.target.value))}
                            placeholder="e.g. 500"
                            className="rounded-xl h-11 border-input bg-background text-sm font-medium"
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Item Discount (₹)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={it.discount || ""}
                            onChange={e => updateItem(idx, "discount", Number(e.target.value))}
                            placeholder="e.g. 250"
                            className="rounded-xl h-11 border-input bg-background text-sm font-medium text-emerald-600 dark:text-emerald-400"
                          />
                        </div>
                      </div>

                      {/* Item Total Calculation Bar */}
                      <div className="rounded-xl border border-border bg-card p-3.5 flex flex-wrap items-center justify-between text-xs sm:text-sm gap-2">
                        <div className="text-muted-foreground flex flex-wrap gap-2">
                          <span>Gold: <strong className="text-foreground">{fmtINR(calc.goldValue)}</strong></span>
                          <span>+ Making: <strong className="text-foreground">{fmtINR(calc.makingTotal)}</strong></span>
                          <span>+ Stone: <strong className="text-foreground">{fmtINR(calc.stoneTotal)}</strong></span>
                          {it.discount > 0 && <span>− Disc: <strong className="text-emerald-600">{fmtINR(it.discount)}</strong></span>}
                        </div>
                        <div className="font-serif text-base font-bold text-[var(--gold)]">
                          Subtotal {fmtINR(calc.subtotal)} + GST (3%): {fmtINR(calc.gstAmount)} = Row Total: {fmtINR(calc.total)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Frame 3: Payment & Grand Total Settlement */}
            <div className="grid gap-6 md:grid-cols-12">
              <Card className="md:col-span-7 rounded-3xl border-2 border-border/80 bg-card p-6 shadow-sm space-y-5">
                <div className="flex items-center gap-2.5 border-b border-border/60 pb-4 text-base font-serif font-bold text-foreground">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--gold)]/20 text-[var(--gold)]">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <span>Step 3: Payment Terms & Settlement</span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment Mode *</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="rounded-xl h-11 border-input bg-background text-sm font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Settlement Status</Label>
                    <Select value={paymentStatus} onValueChange={v => setPaymentStatus(v as any)}>
                      <SelectTrigger className="rounded-xl h-11 border-input bg-background text-sm font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Full">✅ Full Paid Immediately</SelectItem>
                        <SelectItem value="Partial">⏳ Partial / Advance Received</SelectItem>
                        <SelectItem value="Pending">⚠️ Unpaid / Credit Bill</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {paymentStatus !== "Full" && (
                  <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border/40">
                    <div className="grid gap-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Amount Received Now (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={grandTotal}
                        value={paidAmount}
                        onChange={e => setPaidAmount(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="e.g. 5000"
                        className="rounded-xl h-11 border-input bg-background text-sm font-bold text-emerald-600"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Balance Due Date</Label>
                      <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="rounded-xl h-11 border-input bg-background text-sm font-medium" />
                    </div>
                  </div>
                )}
              </Card>

              {/* Grand Total Framed Card */}
              <Card className="md:col-span-5 rounded-3xl border-2 border-[var(--gold)] bg-[var(--gold)]/10 p-6 shadow-md flex flex-col justify-between space-y-4">
                <div className="space-y-3 text-sm">
                  <div className="text-xs font-bold uppercase tracking-widest text-[var(--gold)] mb-2">💰 Settlement Breakdown</div>
                  <div className="flex justify-between font-medium text-foreground/80">
                    <span>Net Taxable Subtotal</span>
                    <span>{fmtINR(grandSubtotal)}</span>
                  </div>
                  <div className="flex justify-between font-medium text-foreground/80">
                    <span>Applicable GST (3%)</span>
                    <span>{fmtINR(grandGst)}</span>
                  </div>
                  <div className="h-px bg-[var(--gold)]/30 my-2" />
                  <div className="flex justify-between items-baseline">
                    <span className="font-serif text-xl font-bold text-foreground">Grand Total</span>
                    <span className="font-serif text-3xl font-extrabold text-[var(--gold)]">{fmtINR(grandTotal)}</span>
                  </div>
                  {paymentStatus === "Partial" && paidAmount !== "" && (
                    <div className="text-xs text-muted-foreground pt-1 flex justify-between">
                      <span>Remaining Balance Due:</span>
                      <strong className="text-red-500 font-bold">{fmtINR(Math.max(0, grandTotal - Number(paidAmount)))}</strong>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={saving}
                  className="w-full h-13 rounded-2xl bg-[var(--gold)] text-navy font-serif text-lg font-bold shadow-lg hover:opacity-90 transition transform active:scale-98 mt-4"
                >
                  {saving ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Generating Invoice…</> : <><Sparkles className="mr-2 h-5 w-5" />Generate & Save Tax Invoice</>}
                </Button>
              </Card>
            </div>
          </form>
        </TabsContent>


        {/* ─── TAB 2: INVOICE HISTORY & PREVIEW ARCHIVE ─────────────────────── */}
        <TabsContent value="history" className="focus:outline-none">
          <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
            
            {/* Left Sidebar List */}
            <Card className="rounded-3xl border-2 border-border/80 p-4 space-y-3 h-[720px] flex flex-col">
              <div className="flex items-center justify-between px-2 pt-1 border-b border-border/60 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stored Bills</span>
                <Button size="sm" variant="ghost" className="h-8 rounded-xl text-xs font-bold text-[var(--gold)]" onClick={() => setActiveTab("create")}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> New Bill
                </Button>
              </div>

              {fetching ? (
                <div className="flex h-full items-center justify-center p-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : bills.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <PackageOpen className="mb-3 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">No invoices generated yet.</p>
                  <Button size="sm" className="mt-4 rounded-xl bg-[var(--gold)] text-navy font-bold" onClick={() => setActiveTab("create")}>
                    Create First Bill
                  </Button>
                </div>
              ) : (
                <div className="space-y-1.5 overflow-y-auto pr-1 flex-1">
                  {bills.map(b => (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBillId(b.id)}
                      className={`flex w-full items-center justify-between rounded-2xl p-3.5 text-left transition border ${
                        b.id === selectedBillId
                          ? "bg-secondary border-[var(--gold)]/50 shadow-sm"
                          : "border-transparent hover:bg-secondary/50"
                      }`}
                    >
                      <div className="overflow-hidden pr-2">
                        <div className="font-semibold text-sm truncate">{b.customerName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {fmtDate(b.date)} · <span className="font-mono text-[11px]">{b.billNumber || b.invoiceNumber}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-[var(--gold)]">{fmtINR(b.amount)}</div>
                        <span className={`inline-block text-[10px] rounded px-1.5 py-0.2 mt-1 font-bold ${
                          b.paymentStatus === "Full" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }`}>{b.paymentStatus || "Full"}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {/* Right Invoice Document Preview */}
            <Card className="rounded-3xl border-2 border-border/80 p-8 shadow-sm min-h-[720px] bg-card flex flex-col justify-between">
              {!selectedBill ? (
                <div className="grid h-full place-items-center my-auto">
                  <div className="text-center">
                    <div className="grid h-16 w-16 place-items-center rounded-2xl gold-gradient text-navy mx-auto mb-4">
                      <Sparkles className="h-8 w-8" />
                    </div>
                    <p className="font-serif text-2xl font-bold text-muted-foreground">Select an invoice</p>
                    <p className="mt-2 text-sm text-muted-foreground">Choose a transaction from the left archive list.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-8 max-w-3xl mx-auto w-full">
                  {/* Document Header */}
                  <div className="flex items-start justify-between border-b-2 border-border pb-6">
                    <div>
                      <div className="font-serif text-3xl font-extrabold tracking-tight text-foreground">{shopName}</div>
                      <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                        {address && <div>📍 {address}</div>}
                        {phone && <div>📞 {phone}</div>}
                        {gstin && <div>🏛️ GSTIN: <strong className="text-foreground font-mono">{gstin}</strong></div>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="inline-block rounded-lg bg-[var(--gold)]/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[var(--gold)] border border-[var(--gold)]/30">
                        Tax Invoice
                      </div>
                      <div className="font-serif text-2xl font-bold text-foreground mt-2 font-mono">
                        {selectedBill.billNumber || selectedBill.invoiceNumber}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Date: {fmtDate(selectedBill.date)}</div>
                    </div>
                  </div>

                  {/* Billed To Box */}
                  <div className="grid gap-6 rounded-2xl bg-secondary/30 p-5 border border-border/60 md:grid-cols-2 text-sm">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Customer Details</div>
                      <div className="text-base font-bold text-foreground">{selectedBill.customerName}</div>
                      {selectedBill.phoneNumber && <div className="text-muted-foreground mt-0.5">📞 {selectedBill.phoneNumber}</div>}
                    </div>
                    <div className="md:text-right">
                      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Payment Status</div>
                      <div className="inline-flex items-center gap-1.5 font-bold">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${selectedBill.paymentStatus === "Full" ? "bg-emerald-500" : "bg-amber-500"}`} />
                        {selectedBill.paymentStatus || "Full"} ({selectedBill.paymentMethod || "Cash"})
                      </div>
                      {selectedBill.paymentStatus !== "Full" && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Paid: {fmtINR(selectedBill.paidAmount)} · Balance: <strong className="text-red-500">{fmtINR(selectedBill.balanceAmount)}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="rounded-2xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground font-bold">
                        <tr>
                          <th className="px-4 py-3.5">Product Title</th>
                          <th className="px-4 py-3.5">Category</th>
                          <th className="px-4 py-3.5">Purity</th>
                          <th className="px-4 py-3.5 text-center">Qty</th>
                          <th className="px-4 py-3.5 text-right">Weight</th>
                          <th className="px-4 py-3.5 text-right">Total Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(selectedBill.items && selectedBill.items.length > 0) ? (
                          selectedBill.items.map((item, idx) => (
                            <tr key={item.id || idx} className="hover:bg-secondary/20">
                              <td className="px-4 py-4 font-bold text-foreground">{item.productName}</td>
                              <td className="px-4 py-4 text-muted-foreground">{item.category || "—"}</td>
                              <td className="px-4 py-4 font-medium">{item.purity || "—"}</td>
                              <td className="px-4 py-4 text-center">{item.quantity}</td>
                              <td className="px-4 py-4 text-right font-mono">{item.weight}g</td>
                              <td className="px-4 py-4 text-right font-bold text-foreground">{fmtINR(item.total || item.price || 0)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="px-4 py-4 font-bold">{selectedBill.productName}</td>
                            <td className="px-4 py-4">{selectedBill.category}</td>
                            <td className="px-4 py-4">{selectedBill.purity}</td>
                            <td className="px-4 py-4 text-center">1</td>
                            <td className="px-4 py-4 text-right font-mono">{selectedBill.weight}g</td>
                            <td className="px-4 py-4 text-right font-bold">{fmtINR(selectedBill.amount)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals Summary Footer */}
                  <div className="flex justify-end pt-4">
                    <div className="w-full max-w-xs space-y-2.5 text-sm">
                      {selectedBill.subtotalAmount != null && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Taxable Subtotal</span>
                          <span className="font-mono">{fmtINR(selectedBill.subtotalAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-muted-foreground">
                        <span>GST (3%)</span>
                        <span className="font-mono">{fmtINR(previewGst)}</span>
                      </div>
                      {selectedBill.discountTotal != null && selectedBill.discountTotal > 0 && (
                        <div className="flex justify-between text-emerald-600 font-medium">
                          <span>Discount Applied</span>
                          <span className="font-mono">− {fmtINR(selectedBill.discountTotal)}</span>
                        </div>
                      )}
                      <div className="h-px bg-border my-2" />
                      <div className="flex justify-between items-baseline font-serif text-xl font-bold">
                        <span>Grand Total</span>
                        <span className="text-2xl text-[var(--gold)]">{fmtINR(previewTotal)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border/60 pt-8 text-center text-xs text-muted-foreground italic">
                    Certified authentic jewelry from {shopName}. Goods once sold cannot be returned without original invoice.
                  </div>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
