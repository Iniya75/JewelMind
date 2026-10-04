import { useState, useEffect } from "react";
import { Send, Loader2, Users, ChevronDown } from "lucide-react";
import { MessagePreviewModal } from "@/components/ai/MessagePreviewModal";
import { toast } from "sonner";

interface BroadcastMessageCardProps {
  onBroadcastComplete?: () => void;
}

const SEGMENTS = [
  { value: "all", label: "All Customers" },
  { value: "premium", label: "Premium Customers (5+ visits)" },
  { value: "inactive", label: "Inactive Customers" },
];

const TEMPLATES = [
  { label: "Bridal Collection", text: "Namaste {Name}! 🌸 Our stunning new bridal collection has arrived. Visit us for exclusive designs crafted just for you." },
  { label: "Diwali Greetings", text: "Namaste {Name}! 🪔 Wishing you a sparkling Diwali from JewelMind. Explore our festive collection today!" },
  { label: "Akshaya Tritiya", text: "Namaste {Name}! ✨ Celebrate Akshaya Tritiya with our exclusive gold offers. Visit us for special discounts!" },
  { label: "Re-engagement", text: "Namaste {Name}! We miss you! Come visit us and discover our new arrivals. Exciting offers await!" },
];

const API_BASE = "/api";
function getToken() { return localStorage.getItem("access_token") || ""; }

export function BroadcastMessageCard({ onBroadcastComplete }: BroadcastMessageCardProps) {
  const [campaignName, setCampaignName] = useState("");
  const [segment, setSegment] = useState("all");
  const [message, setMessage] = useState("");
  const [city, setCity] = useState("");
  const [spendThreshold, setSpendThreshold] = useState("");
  const [estimatedCount, setEstimatedCount] = useState<number | undefined>();
  const [countLoading, setCountLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sending, setSending] = useState(false);

  // Compute actual target_group string
  const targetGroup =
    segment === "city" ? `city:${city}` :
    segment === "spend_above" ? `spend_above:${spendThreshold}` :
    segment;

  // Fetch count when segment changes
  useEffect(() => {
    if (!targetGroup) return;
    let active = true;
    setCountLoading(true);
    fetch(`${API_BASE}/whatsapp/segment-count`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ target_group: targetGroup }),
    })
      .then((r) => r.json())
      .then((d) => { if (active) setEstimatedCount(d.estimated_count ?? 0); })
      .catch(() => { if (active) setEstimatedCount(undefined); })
      .finally(() => { if (active) setCountLoading(false); });
    return () => { active = false; };
  }, [targetGroup]);

  const handleSend = async () => {
    setSending(true);
    try {
      const resp = await fetch(`${API_BASE}/whatsapp/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          campaign_name: campaignName || "Quick Broadcast",
          message,
          target_group: targetGroup,
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast.success(`✅ Broadcast complete! ${data.success_count}/${data.total_customers} delivered (${data.delivery_percentage}%)`);
        setCampaignName(""); setMessage("");
        onBroadcastComplete?.();
      } else {
        toast.error(data.detail || "Broadcast failed");
      }
    } catch {
      toast.error("Could not reach the server");
    } finally {
      setSending(false);
      setPreviewOpen(false);
    }
  };

  return (
    <>
      <div
        className="rounded-3xl p-6 space-y-5 h-full"
        style={{
          background: "white",
          border: "1px solid oklch(0.9 0.012 85)",
          boxShadow: "0 1px 2px rgba(7,27,59,0.04), 0 8px 24px -8px rgba(7,27,59,0.08)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg"
            style={{ background: "linear-gradient(135deg, oklch(0.224 0.062 263), oklch(0.18 0.07 263))" }}
          >
            📡
          </div>
          <div>
            <div className="font-serif text-lg font-semibold" style={{ color: "oklch(0.224 0.062 263)" }}>
              Broadcast Message
            </div>
            <div className="text-xs" style={{ color: "oklch(0.55 0.03 263)" }}>
              Send to customer segments from MySQL
            </div>
          </div>
        </div>

        {/* Campaign name */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
            Campaign Name
          </label>
          <input
            type="text"
            placeholder="e.g. Diwali 2025 Greetings"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:ring-1"
            style={{
              borderColor: "oklch(0.9 0.012 85)",
              color: "oklch(0.224 0.062 263)",
              background: "oklch(0.969 0.012 85)",
              "--tw-ring-color": "oklch(0.745 0.142 78)",
            } as React.CSSProperties}
          />
        </div>

        {/* Segment */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
            Target Segment
          </label>
          <div className="relative">
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              className="w-full appearance-none rounded-xl border px-3.5 py-2.5 text-sm outline-none pr-9 transition focus:ring-1"
              style={{ borderColor: "oklch(0.9 0.012 85)", color: "oklch(0.224 0.062 263)", background: "oklch(0.969 0.012 85)" }}
            >
              {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              <option value="city">By City</option>
              <option value="spend_above">Spend Above Threshold</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4" style={{ color: "oklch(0.55 0.03 263)" }} />
          </div>

          {segment === "city" && (
            <input
              placeholder="Enter city name (e.g. Chennai)"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none"
              style={{ borderColor: "oklch(0.9 0.012 85)", color: "oklch(0.224 0.062 263)", background: "oklch(0.969 0.012 85)" }}
            />
          )}
          {segment === "spend_above" && (
            <input
              type="number"
              placeholder="Enter threshold in ₹ (e.g. 50000)"
              value={spendThreshold}
              onChange={(e) => setSpendThreshold(e.target.value)}
              className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none"
              style={{ borderColor: "oklch(0.9 0.012 85)", color: "oklch(0.224 0.062 263)", background: "oklch(0.969 0.012 85)" }}
            />
          )}

          {/* Count badge */}
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5" style={{ color: "oklch(0.745 0.142 78)" }} />
            <span className="text-xs" style={{ color: "oklch(0.55 0.03 263)" }}>
              {countLoading ? "Counting..." :
               estimatedCount !== undefined ? `~${estimatedCount} customers with phone numbers` :
               "Select a segment"}
            </span>
          </div>
        </div>

        {/* Templates */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
            Quick Templates
          </label>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => setMessage(t.text)}
                className="rounded-full px-3 py-1 text-[11px] font-medium transition hover:opacity-80"
                style={{
                  background: "oklch(0.745 0.142 78 / 0.1)",
                  border: "1px solid oklch(0.745 0.142 78 / 0.35)",
                  color: "oklch(0.45 0.08 78)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
              Message (use {"{Name}"} for personalization)
            </label>
            <span className="text-[10px]" style={{ color: message.length > 1000 ? "red" : "oklch(0.65 0.02 263)" }}>
              {message.length}/1024
            </span>
          </div>
          <textarea
            rows={4}
            placeholder="Namaste {Name}! We have an exciting offer for you..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1024}
            className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none resize-none focus:ring-1"
            style={{ borderColor: "oklch(0.9 0.012 85)", color: "oklch(0.224 0.062 263)", background: "oklch(0.969 0.012 85)" }}
          />
        </div>

        {/* Send Button */}
        <button
          onClick={() => setPreviewOpen(true)}
          disabled={!message.trim() || sending}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, oklch(0.224 0.062 263), oklch(0.18 0.07 263))",
            color: "oklch(0.82 0.13 82)",
          }}
        >
          <Send className="h-4 w-4" />
          Preview & Send
        </button>
      </div>

      <MessagePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onConfirm={handleSend}
        campaignName={campaignName || "Quick Broadcast"}
        targetGroup={targetGroup}
        message={message}
        estimatedCount={estimatedCount}
        loading={sending}
      />
    </>
  );
}
