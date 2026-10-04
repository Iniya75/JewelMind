import { useEffect, useMemo, useState } from "react";
import { Loader2, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getCustomers, sendWhatsAppToCustomer } from "@/lib/api-service";
import type { Customer } from "@/lib/firebase-types";

interface SingleCustomerMessageCardProps {
  onMessageSent?: () => void;
}

export function SingleCustomerMessageCard({ onMessageSent }: SingleCustomerMessageCardProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    getCustomers()
      .then((list) => {
        if (!active) return;
        setCustomers(list);
        setSelectedCustomerId(list[0]?.id ?? "");
      })
      .catch(() => toast.error("Failed to load customers"))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId),
    [customers, selectedCustomerId],
  );

  async function handleSend() {
    if (!selectedCustomerId || !message.trim()) {
      toast.error("Please choose a customer and enter a message");
      return;
    }

    setSending(true);
    try {
      await sendWhatsAppToCustomer(selectedCustomerId, message.trim());
      toast.success("✅ Message Sent Successfully");
      setMessage("");
      onMessageSent?.();
    } catch {
      toast.error("❌ Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="space-y-5 rounded-3xl p-6"
      style={{
        background: "white",
        border: "1px solid oklch(0.9 0.012 85)",
        boxShadow: "0 1px 2px rgba(7,27,59,0.04), 0 8px 24px -8px rgba(7,27,59,0.08)",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-2xl"
          style={{ background: "oklch(0.62 0.14 155 / 0.12)", color: "oklch(0.42 0.14 155)" }}
        >
          <UserRound className="h-5 w-5" />
        </div>
        <div>
          <div className="font-serif text-lg font-semibold" style={{ color: "oklch(0.224 0.062 263)" }}>
            Single Customer Message
          </div>
          <div className="text-xs" style={{ color: "oklch(0.55 0.03 263)" }}>
            Send from the connected business number
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "oklch(0.745 0.142 78)" }}>
          Customer
        </label>
        <select
          value={selectedCustomerId}
          onChange={(event) => setSelectedCustomerId(event.target.value)}
          disabled={loading || customers.length === 0}
          className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:ring-1 disabled:opacity-60"
          style={{
            borderColor: "oklch(0.9 0.012 85)",
            color: "oklch(0.224 0.062 263)",
            background: "oklch(0.969 0.012 85)",
          }}
        >
          {loading ? (
            <option value="">Loading customers...</option>
          ) : customers.length === 0 ? (
            <option value="">No customers available</option>
          ) : (
            customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))
          )}
        </select>
        {selectedCustomer && (
          <div className="text-xs" style={{ color: "oklch(0.55 0.03 263)" }}>
            Recipient: {selectedCustomer.name}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "oklch(0.745 0.142 78)" }}>
            Message
          </label>
          <span className="text-[10px]" style={{ color: message.length > 1000 ? "red" : "oklch(0.65 0.02 263)" }}>
            {message.length}/1024
          </span>
        </div>
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          maxLength={1024}
          placeholder="Type your WhatsApp message..."
          className="resize-none rounded-xl"
          style={{ color: "oklch(0.224 0.062 263)", background: "oklch(0.969 0.012 85)" }}
        />
      </div>

      <Button
        type="button"
        onClick={handleSend}
        disabled={sending || loading || !selectedCustomerId || !message.trim()}
        className="w-full rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90"
      >
        {sending ? (
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
  );
}
