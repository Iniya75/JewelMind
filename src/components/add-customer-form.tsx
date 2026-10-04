import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JEWELRY_CATEGORIES } from "@/lib/mock-data";
import { toast } from "sonner";

export function AddCustomerForm() {
  const [payment, setPayment] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState<number>(0);
  const [paid, setPaid] = useState<number>(0);
  const balance = Math.max(0, amount - paid);

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => { e.preventDefault(); toast.success("Customer added"); }}
    >
      <section>
        <h3 className="mb-3 font-serif text-lg">Basic Information</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name"><Input required placeholder="Full name" /></Field>
          <Field label="Phone Number"><Input required placeholder="+91 …" /></Field>
          <Field label="Email"><Input type="email" placeholder="name@example.com" /></Field>
          <Field label="Date of Birth (optional)"><Input type="date" /></Field>
          <Field label="Address" className="md:col-span-2"><Input placeholder="Street, City" /></Field>
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-serif text-lg">Purchase Details</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Product Name"><Input placeholder="e.g. Antique Gold Chain" /></Field>
          <Field label="Category">
            <Select>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {JEWELRY_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Weight (g)"><Input type="number" step="0.01" placeholder="0.00" /></Field>
          <Field label="Purity">
            <Select>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="22K / 18K / 925…" /></SelectTrigger>
              <SelectContent>
                {["24K","22K","18K","14K","925 Silver"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Purchase Date"><Input type="date" /></Field>
          <Field label="Purchase Amount (₹)">
            <Input type="number" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-serif text-lg">Payment</h3>
        <RadioGroup value={payment} onValueChange={(v) => setPayment(v as any)} className="mb-3 flex gap-6">
          <label className="flex items-center gap-2">
            <RadioGroupItem value="full" /> Full Payment
          </label>
          <label className="flex items-center gap-2">
            <RadioGroupItem value="partial" /> Partial Payment
          </label>
        </RadioGroup>
        {payment === "partial" && (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Paid Amount (₹)">
              <Input type="number" value={paid || ""} onChange={(e) => setPaid(Number(e.target.value))} />
            </Field>
            <Field label="Balance Amount (₹)">
              <Input readOnly value={balance} className="bg-secondary" />
            </Field>
            <Field label="Due Date"><Input type="date" /></Field>
          </div>
        )}
      </section>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" className="rounded-2xl">Cancel</Button>
        <Button type="submit" className="rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90">Save Customer</Button>
      </div>
    </form>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid gap-1.5 ${className}`}>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
