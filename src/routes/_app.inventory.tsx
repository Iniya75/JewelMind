import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Boxes, PackageOpen, Trash2, RefreshCw, Pencil,
  IndianRupee, Package, TrendingDown, Loader2, Search, X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/inventory")({
  component: InventoryPage,
  head: () => ({ meta: [{ title: "Inventory · JewelMind AI" }] }),
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  purity: string;
  weight: number;
  stockQuantity: number;
  purchasePrice: number | null;
  sellingPrice: number | null;
  ratePerGram: number | null;
  createdAt: string | null;
};

type InventoryStats = {
  totalItems: number;
  totalUnits: number;
  inventoryValue: number;
  lowStock: Product[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const JEWELRY_CATEGORIES = [
  "Gold Ring", "Gold Necklace", "Gold Bangle", "Gold Earring",
  "Gold Chain", "Gold Pendant", "Gold Bracelet", "Diamond Jewellery",
  "Silver", "Platinum", "Other",
];

const PURITIES = ["22K", "24K", "18K", "14K", "925 Silver", "Platinum 950", "Other"];

const API_BASE = "/api";
function getToken() { return localStorage.getItem("access_token") || ""; }

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...opts.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/auth";
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "API error");
  }
  return res.json();
}

function fmtINR(v: number | null | undefined) {
  if (v == null) return "—";
  return `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formPurity, setFormPurity] = useState("22K");
  const [formWeight, setFormWeight] = useState<number | "">("");
  const [formStock, setFormStock] = useState<number | "">("");
  const [formPurchasePrice, setFormPurchasePrice] = useState<number | "">("");
  const [formSellingPrice, setFormSellingPrice] = useState<number | "">("");
  const [formRatePerGram, setFormRatePerGram] = useState<number | "">("");
  const [formSku, setFormSku] = useState("");

  // Edit/detail dialog
  const [selected, setSelected] = useState<Product | null>(null);
  const [editStockVal, setEditStockVal] = useState<number | "">("");
  const [editPriceVal, setEditPriceVal] = useState<number | "">("");
  const [updateLoading, setUpdateLoading] = useState(false);

  const fetchInventory = useCallback(async (showError = true) => {
    setLoading(true);
    try {
      const data = await apiFetch("/inventory");
      setProducts(data.items || []);
      setStats({
        totalItems: data.totalItems,
        totalUnits: data.totalUnits,
        inventoryValue: data.inventoryValue,
        lowStock: data.lowStock || [],
      });
      return true;
    } catch (err: any) {
      if (showError) toast.error(err.message || "Failed to load inventory");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);

  // Filtered products
  const filtered = products.filter((p) => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.category || "").toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === "all" || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  // ─── Add SKU ──────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (
      !formName.trim() || !formCategory || !formPurity || formWeight === "" ||
      formStock === "" || formPurchasePrice === "" || formSellingPrice === "" ||
      formRatePerGram === ""
    ) {
      toast.error("Complete all product fields before saving");
      return;
    }
    if (
      Number(formWeight) < 0 || !Number.isInteger(Number(formStock)) || Number(formStock) < 0 ||
      Number(formPurchasePrice) < 0 || Number(formSellingPrice) < 0 || Number(formRatePerGram) < 0
    ) {
      toast.error("Product quantities and prices must be valid non-negative numbers");
      return;
    }
    setAddLoading(true);
    try {
      await apiFetch("/products", {
        method: "POST",
        body: JSON.stringify({
          name: formName.trim(),
          category: formCategory,
          purity: formPurity,
          weight: Number(formWeight || 0),
          stockQuantity: Number(formStock || 0),
          purchasePrice: formPurchasePrice !== "" ? Number(formPurchasePrice) : null,
          sellingPrice: formSellingPrice !== "" ? Number(formSellingPrice) : null,
          ratePerGram: formRatePerGram !== "" ? Number(formRatePerGram) : null,
          sku: formSku.trim() || undefined,
        }),
      });
      const refreshed = await fetchInventory(false);
      if (refreshed) toast.success("Product saved to MySQL and inventory refreshed");
      else toast.error("Product was saved, but the inventory list could not refresh");
      setAddOpen(false);
      setFormName(""); setFormCategory(""); setFormPurity("22K");
      setFormWeight(""); setFormStock(""); setFormPurchasePrice("");
      setFormSellingPrice(""); setFormRatePerGram(""); setFormSku("");
    } catch (err: any) {
      toast.error(err.message || "Failed to add product");
    } finally {
      setAddLoading(false);
    }
  }

  // ─── Update Stock / Price ─────────────────────────────────────────────────

  async function handleUpdate() {
    if (!selected) return;
    setUpdateLoading(true);
    try {
      await apiFetch(`/products/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: selected.name,
          category: selected.category,
          purity: selected.purity,
          weight: selected.weight,
          stockQuantity: editStockVal !== "" ? Number(editStockVal) : selected.stockQuantity,
          sellingPrice: editPriceVal !== "" ? Number(editPriceVal) : selected.sellingPrice,
        }),
      });
      toast.success("Product updated");
      setSelected(null);
      fetchInventory();
    } catch (err: any) {
      toast.error(err.message || "Update failed");
    } finally {
      setUpdateLoading(false);
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Remove this SKU from inventory?")) return;
    try {
      await apiFetch(`/products/${id}`, { method: "DELETE" });
      toast.success("Removed from inventory");
      fetchInventory();
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    }
  }

  function openDetail(p: Product) {
    setSelected(p);
    setEditStockVal(p.stockQuantity);
    setEditPriceVal(p.sellingPrice ?? "");
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Stock"
        title="Inventory"
        description="Manage your jewellery stock in real-time. Changes sync with billing instantly."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchInventory}
              disabled={loading}
              className="rounded-2xl border-border/60"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              onClick={() => setAddOpen(true)}
              className="rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90"
            >
              <Plus className="mr-1 h-4 w-4" /> Add SKU
            </Button>
          </div>
        }
      />

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total SKUs", value: stats.totalItems, icon: Package, color: "text-blue-500" },
            { label: "Total Units", value: stats.totalUnits, icon: Boxes, color: "text-amber-500" },
            {
              label: "Inventory Value", value: fmtINR(stats.inventoryValue),
              icon: IndianRupee, color: "text-emerald-500",
            },
            {
              label: "Low Stock Items", value: stats.lowStock.length,
              icon: TrendingDown, color: stats.lowStock.length > 0 ? "text-rose-500" : "text-muted-foreground",
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="luxe-card rounded-2xl border-border/60 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${color}`} />
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
              </div>
              <p className="font-serif text-2xl font-semibold">{value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Low Stock Alert */}
      {stats && stats.lowStock.length > 0 && (
        <Card className="luxe-card flex items-start gap-3 rounded-3xl border-rose-300/70 bg-rose-50/70 dark:bg-rose-950/20 p-5 text-rose-900 dark:text-rose-300">
          <TrendingDown className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>
            <div className="font-serif text-lg font-semibold">Low Stock Alert</div>
            <p className="mt-1 text-sm text-rose-900/80 dark:text-rose-300/80">
              {stats.lowStock.map((i) => `${i.name} (${i.stockQuantity} left)`).join(", ")} — restock soon.
            </p>
          </div>
        </Card>
      )}

      {/* Search + Filter Row */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, SKU, or category…"
            className="w-full rounded-xl border border-border bg-secondary/30 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/30 focus:border-[var(--gold)]/50"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="rounded-xl w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {JEWELRY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Inventory Table */}
      <Card className="luxe-card overflow-hidden rounded-3xl border-border/60 p-0">
        {loading ? (
          <div className="flex items-center justify-center p-16 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--gold)]" />
            <span className="text-sm">Loading inventory…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <PackageOpen className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              {products.length === 0 ? "No inventory items yet." : "No items match your search."}
            </p>
            {products.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Add your first SKU to start tracking stock.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  {["SKU", "Product", "Category", "Weight", "Purity", "Stock", "Selling Price", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => openDetail(p)}
                    className="cursor-pointer border-t border-border/60 transition hover:bg-secondary/40"
                  >
                    <td className="px-4 py-3.5 font-mono text-xs text-[var(--gold)]">{p.sku || "—"}</td>
                    <td className="px-4 py-3.5 font-medium max-w-[180px]">
                      <span className="line-clamp-1">{p.name}</span>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">{p.category || "—"}</td>
                    <td className="px-4 py-3.5">{p.weight ? `${p.weight}g` : "—"}</td>
                    <td className="px-4 py-3.5">{p.purity || "—"}</td>
                    <td className="px-4 py-3.5">
                      {p.stockQuantity <= 3
                        ? <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                            Low · {p.stockQuantity}
                          </Badge>
                        : <span className="font-medium">{p.stockQuantity}</span>}
                    </td>
                    <td className="px-4 py-3.5 font-medium">{fmtINR(p.sellingPrice)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); openDetail(p); }}
                          className="text-muted-foreground hover:text-[var(--gold)] transition"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(p.id, e)}
                          className="text-rose-500 hover:opacity-80 transition"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border/40">
              Showing {filtered.length} of {products.length} SKUs
            </div>
          </div>
        )}
      </Card>

      {/* ── Add SKU Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl flex items-center gap-2">
              <Plus className="h-5 w-5 text-[var(--gold)]" /> Add New SKU
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Product Name *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Antique Gold Chain"
                className="rounded-xl"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Category *</Label>
                <Select value={formCategory} onValueChange={setFormCategory} required>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {JEWELRY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Purity</Label>
                <Select value={formPurity} onValueChange={setFormPurity}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PURITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Custom SKU (optional)</Label>
              <Input
                value={formSku}
                onChange={(e) => setFormSku(e.target.value)}
                placeholder="e.g. GR-22K-001 (auto-generated if blank)"
                className="rounded-xl font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Weight (g) *", val: formWeight, set: setFormWeight, placeholder: "0", step: "any" },
                { label: "Stock Units *", val: formStock, set: setFormStock, placeholder: "0", step: "1" },
                { label: "Purchase Price ₹ *", val: formPurchasePrice, set: setFormPurchasePrice, placeholder: "0", step: "any" },
                { label: "Selling Price ₹ *", val: formSellingPrice, set: setFormSellingPrice, placeholder: "0", step: "any" },
                { label: "Rate Per Gram ₹ *", val: formRatePerGram, set: setFormRatePerGram, placeholder: "0", step: "any" },
              ].map(({ label, val, set, placeholder, step }) => (
                <div key={label} className="grid gap-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
                  <Input
                    type="number"
                    min="0"
                    step={step}
                    value={val}
                    onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder={placeholder}
                    className="rounded-xl"
                    required
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={addLoading}
                className="rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90"
              >
                {addLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Add SKU
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Detail / Edit Dialog ────────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-serif text-2xl">
              <Boxes className="h-5 w-5 text-[var(--gold)]" /> {selected?.name}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="grid gap-4 text-sm">
              <div className="grid gap-2">
                {[
                  { label: "SKU", value: <span className="font-mono text-[var(--gold)]">{selected.sku || "—"}</span> },
                  { label: "Category", value: selected.category || "—" },
                  { label: "Purity", value: selected.purity || "—" },
                  { label: "Weight", value: selected.weight ? `${selected.weight}g` : "—" },
                  {
                    label: "Purchase Price",
                    value: fmtINR(selected.purchasePrice),
                  },
                  {
                    label: "Estimated stock value",
                    value: fmtINR((selected.sellingPrice || 0) * selected.stockQuantity),
                  },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between border-b border-border/60 py-2 last:border-0">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
              </div>

              {/* Editable Fields */}
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Update Stock</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={editStockVal}
                    onChange={(e) => setEditStockVal(e.target.value === "" ? "" : Number(e.target.value))}
                    className="rounded-xl"
                  />
                  <p className="text-[10px] text-muted-foreground">Current: {selected.stockQuantity} units</p>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Selling Price ₹</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={editPriceVal}
                    onChange={(e) => setEditPriceVal(e.target.value === "" ? "" : Number(e.target.value))}
                    className="rounded-xl"
                  />
                  <p className="text-[10px] text-muted-foreground">Current: {fmtINR(selected.sellingPrice)}</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <Button variant="outline" className="rounded-2xl" onClick={() => setSelected(null)}>
                  Close
                </Button>
                <Button
                  onClick={handleUpdate}
                  disabled={updateLoading}
                  className="rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90"
                >
                  {updateLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Pencil className="h-4 w-4 mr-1" />}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
