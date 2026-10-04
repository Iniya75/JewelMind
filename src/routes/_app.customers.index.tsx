import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, Plus, Search, Send, Users, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fmtINR, fmtDate, JEWELRY_CATEGORIES } from "@/lib/mock-data";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useOwnerProfile } from "@/hooks/use-owner-profile";
import { getCustomers, addCustomer, updateCustomer, getBillsForCustomer, sendWhatsAppToCustomer } from "@/lib/api-service";
import type { Customer } from "@/lib/firebase-types";

export const Route = createFileRoute("/_app/customers/")({
  component: CustomersPage,
  head: () => ({ meta: [{ title: "Customers · JewelMind AI" }] }),
});

function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerLTV, setCustomerLTV] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [whatsappCustomer, setWhatsappCustomer] = useState<Customer | null>(null);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [whatsappSending, setWhatsappSending] = useState(false);
  const navigate = useNavigate();

  // New customer form state
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newDob, setNewDob] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getCustomers().then((list) => {
      if (!active) return;
      setCustomers(list);
      setFetchError("");
      setFetching(false);
      // Fetch LTV for each customer
      list.forEach(async (c) => {
        const bills = await getBillsForCustomer(c.id);
        const ltv = bills.reduce((s, b) => s + b.amount, 0);
        if (active) setCustomerLTV((prev) => ({ ...prev, [c.id]: ltv }));
      });
    }).catch((error: Error) => {
      if (!active) return;
      setFetchError(error.message || "Unable to load customers from the server.");
      toast.error(`Could not load customers: ${error.message}`);
      setFetching(false);
    });
    return () => { active = false; };
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return customers;
    return customers.filter((c) =>
      c.name.toLowerCase().includes(s) ||
      c.phone.replace(/\s/g, "").includes(s.replace(/\s/g, ""))
    );
  }, [q, customers]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) {
      toast.error("Name and phone are required");
      return;
    }
    setSaving(true);
    try {
      const customer: Omit<Customer, "id"> = {
        name: newName.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim(),
        city: newCity.trim(),
        address: newAddress.trim(),
        dob: newDob || undefined,
        customerSince: new Date().toISOString().slice(0, 10),
        visits: 1,
      };
      await addCustomer(customer);
      setNewName(""); setNewPhone(""); setNewEmail(""); setNewCity("");
      setNewAddress(""); setNewDob("");
      setAddOpen(false);
      try {
        const refreshedCustomers = await getCustomers();
        setCustomers(refreshedCustomers);
        setFetchError("");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown API error";
        setFetchError(`Customer saved, but the list could not refresh: ${message}`);
        toast.error(`Customer saved, but the list could not refresh: ${message}`);
        return;
      }
      toast.success("Customer added");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown API error";
      toast.error(`Failed to add customer: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const { id, ...data } = editing;
      await updateCustomer(id, data);
      setEditing(null);
      try {
        const refreshedCustomers = await getCustomers();
        setCustomers(refreshedCustomers);
        setFetchError("");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown API error";
        setFetchError(`Customer updated, but the list could not refresh: ${message}`);
        toast.error(`Customer updated, but the list could not refresh: ${message}`);
        return;
      }
      toast.success("Customer updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown API error";
      toast.error(`Failed to update customer: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendWhatsApp(e: React.FormEvent) {
    e.preventDefault();
    if (!whatsappCustomer || !whatsappMessage.trim()) {
      toast.error("Please enter a message");
      return;
    }

    setWhatsappSending(true);
    try {
      await sendWhatsAppToCustomer(whatsappCustomer.id, whatsappMessage.trim());
      toast.success("✅ Message Sent Successfully");
      setWhatsappCustomer(null);
      setWhatsappMessage("");
    } catch {
      toast.error("❌ Failed to send message.");
    } finally {
      setWhatsappSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM"
        title="Customers"
        description="Search by name or phone — open a profile to see every purchase."
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-72 rounded-2xl border-border bg-card pl-9"
              />
            </div>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90">
                  <Plus className="mr-1 h-4 w-4" /> Add Customer
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto rounded-3xl">
                <DialogHeader>
                  <DialogTitle className="font-serif text-2xl">New Customer</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAdd} className="grid gap-4 mt-2">
                  {[
                    { label: "Full Name *", val: newName, set: setNewName, placeholder: "Lakshmi Narayanan" },
                    { label: "Phone *", val: newPhone, set: setNewPhone, placeholder: "+91 98400 12345" },
                    { label: "Email", val: newEmail, set: setNewEmail, placeholder: "name@example.com" },
                    { label: "City", val: newCity, set: setNewCity, placeholder: "Chennai" },
                    { label: "Address", val: newAddress, set: setNewAddress, placeholder: "12, Anna Nagar East" },
                  ].map(({ label, val, set, placeholder }) => (
                    <div key={label} className="grid gap-1.5">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
                      <Input value={val} onChange={(e) => set(e.target.value)} placeholder={placeholder} className="rounded-xl" />
                    </div>
                  ))}
                  <div className="grid gap-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date of Birth</Label>
                    <Input type="date" value={newDob} onChange={(e) => setNewDob(e.target.value)} className="rounded-xl" />
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setAddOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={saving} className="rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90">
                      {saving ? "Saving…" : "Add Customer"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <Card className="luxe-card overflow-hidden rounded-3xl border-border/60 p-0">
        {fetching ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading customers…</div>
        ) : fetchError ? (
          <div className="p-12 text-center text-sm text-destructive">{fetchError}</div>
        ) : results.length === 0 && !q ? (
          <div className="p-16 text-center">
            <Users className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No customer records available.</p>
            <p className="mt-1 text-xs text-muted-foreground">Add your first customer to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  {["Name", "Phone", "City", "Customer Since", "Visits", "Lifetime Value", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate({ to: "/customers/$id", params: { id: c.id } })}
                    className="cursor-pointer border-t border-border/60 transition hover:bg-secondary/40"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">{c.phone}</td>
                    <td className="px-4 py-3.5">{c.city || "—"}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">{fmtDate(c.customerSince)}</td>
                    <td className="px-4 py-3.5">{c.visits}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-medium text-[var(--gold)]">
                      {customerLTV[c.id] !== undefined ? fmtINR(customerLTV[c.id]) : "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setWhatsappCustomer(c);
                            setWhatsappMessage("");
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Send WhatsApp
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditing(c); }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-secondary"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length === 0 && q && (
              <div className="p-12 text-center text-sm text-muted-foreground">No customers match "{q}".</div>
            )}
          </div>
        )}
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Edit Customer</DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={handleSaveEdit} className="grid gap-4">
              {[
                { label: "Name", key: "name" as const, placeholder: "" },
                { label: "Phone", key: "phone" as const, placeholder: "" },
                { label: "Email", key: "email" as const, placeholder: "" },
                { label: "City", key: "city" as const, placeholder: "" },
                { label: "Address", key: "address" as const, placeholder: "" },
              ].map(({ label, key }) => (
                <div key={key} className="grid gap-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
                  <Input
                    value={(editing as any)[key] ?? ""}
                    onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
              ))}
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={saving} className="rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90">
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Send WhatsApp Dialog */}
      <Dialog
        open={!!whatsappCustomer}
        onOpenChange={(open) => {
          if (!open) {
            setWhatsappCustomer(null);
            setWhatsappMessage("");
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Send WhatsApp</DialogTitle>
          </DialogHeader>
          {whatsappCustomer && (
            <form onSubmit={handleSendWhatsApp} className="grid gap-4">
              <div className="rounded-2xl border border-border bg-secondary/50 px-4 py-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Recipient</div>
                <div className="mt-1 font-medium">{whatsappCustomer.name}</div>
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
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => {
                    setWhatsappCustomer(null);
                    setWhatsappMessage("");
                  }}
                >
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
