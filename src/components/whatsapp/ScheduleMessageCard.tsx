import { useState } from "react";
import { Calendar, Clock, Send, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const API_BASE = "/api";
function getToken() { return localStorage.getItem("access_token") || ""; }

const QUICK_SCHEDULES = [
  { label: "Tomorrow 10 AM", offset: 1, hour: 10 },
  { label: "Tomorrow 6 PM", offset: 1, hour: 18 },
  { label: "Next Week", offset: 7, hour: 10 },
];

const CAMPAIGN_TEMPLATES = [
  { label: "Diwali Campaign", name: "Diwali 2025 Greetings", message: "Namaste {Name}! 🪔 Wishing you and your family a sparkling Diwali! Explore our festive collection." },
  { label: "Akshaya Tritiya", name: "Akshaya Tritiya Offer", message: "Namaste {Name}! ✨ Celebrate Akshaya Tritiya with JewelMind. Special gold offers await!" },
  { label: "Birthday Wishes", name: "Birthday Wishes", message: "Happy Birthday {Name}! 🎂 JewelMind wishes you a golden day. Visit us for a special birthday treat!" },
  { label: "Anniversary", name: "Anniversary Wishes", message: "Congratulations {Name}! 💍 JewelMind celebrates your special day with exclusive offers." },
];

const SEGMENTS = [
  { value: "all", label: "All Customers" },
  { value: "premium", label: "Premium Customers" },
  { value: "inactive", label: "Inactive Customers" },
];

interface ScheduleMessageCardProps {
  onScheduled?: () => void;
}

export function ScheduleMessageCard({ onScheduled }: ScheduleMessageCardProps) {
  const [campaignName, setCampaignName] = useState("");
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState("all");
  const [scheduledAt, setScheduledAt] = useState("");
  const [loading, setLoading] = useState(false);

  const applyQuickSchedule = (offset: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(hour, 0, 0, 0);
    setScheduledAt(d.toISOString().slice(0, 16));
  };

  const applyTemplate = (t: typeof CAMPAIGN_TEMPLATES[0]) => {
    setCampaignName(t.name);
    setMessage(t.message);
  };

  const handleSchedule = async () => {
    if (!message.trim() || !scheduledAt) {
      toast.error("Please fill in message and schedule time");
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/whatsapp/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          campaign_name: campaignName || "Scheduled Campaign",
          message,
          target_group: segment,
          scheduled_at: new Date(scheduledAt).toISOString(),
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        toast.success(`✅ ${data.message || "Campaign scheduled!"}`);
        setCampaignName(""); setMessage(""); setScheduledAt("");
        onScheduled?.();
      } else {
        toast.error(data.detail || "Scheduling failed");
      }
    } catch {
      toast.error("Could not reach the server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-3xl p-6 space-y-5"
      style={{ background: "white", border: "1px solid oklch(0.9 0.012 85)", boxShadow: "0 1px 2px rgba(7,27,59,0.04), 0 8px 24px -8px rgba(7,27,59,0.08)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg"
             style={{ background: "oklch(0.745 0.142 78 / 0.12)" }}>🗓️</div>
        <div>
          <div className="font-serif text-lg font-semibold" style={{ color: "oklch(0.224 0.062 263)" }}>
            Schedule Campaign
          </div>
          <div className="text-xs" style={{ color: "oklch(0.55 0.03 263)" }}>
            Plan campaigns in advance
          </div>
        </div>
      </div>

      {/* Template picker */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
          Campaign Templates
        </label>
        <div className="flex flex-wrap gap-1.5">
          {CAMPAIGN_TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => applyTemplate(t)}
              className="rounded-full px-3 py-1 text-[11px] font-medium transition hover:opacity-80"
              style={{
                background: "oklch(0.224 0.062 263 / 0.08)",
                border: "1px solid oklch(0.224 0.062 263 / 0.2)",
                color: "oklch(0.35 0.05 263)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Campaign Name */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
          Campaign Name
        </label>
        <input
          type="text"
          placeholder="e.g. Diwali 2025 Greetings"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none"
          style={{ borderColor: "oklch(0.9 0.012 85)", color: "oklch(0.224 0.062 263)", background: "oklch(0.969 0.012 85)" }}
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
            className="w-full appearance-none rounded-xl border px-3.5 py-2.5 text-sm outline-none pr-9"
            style={{ borderColor: "oklch(0.9 0.012 85)", color: "oklch(0.224 0.062 263)", background: "oklch(0.969 0.012 85)" }}
          >
            {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4" style={{ color: "oklch(0.55 0.03 263)" }} />
        </div>
      </div>

      {/* Message */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
          Message
        </label>
        <textarea
          rows={3}
          placeholder="Namaste {Name}! Your message here..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none resize-none"
          style={{ borderColor: "oklch(0.9 0.012 85)", color: "oklch(0.224 0.062 263)", background: "oklch(0.969 0.012 85)" }}
        />
      </div>

      {/* Date & Time */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "oklch(0.745 0.142 78)" }}>
          Schedule Date & Time
        </label>
        {/* Quick options */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {QUICK_SCHEDULES.map((q) => (
            <button
              key={q.label}
              onClick={() => applyQuickSchedule(q.offset, q.hour)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition hover:opacity-80"
              style={{
                background: "oklch(0.745 0.142 78 / 0.1)",
                border: "1px solid oklch(0.745 0.142 78 / 0.3)",
                color: "oklch(0.45 0.08 78)",
              }}
            >
              <Clock className="h-3 w-3" /> {q.label}
            </button>
          ))}
        </div>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none"
          style={{ borderColor: "oklch(0.9 0.012 85)", color: "oklch(0.224 0.062 263)", background: "oklch(0.969 0.012 85)" }}
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSchedule}
        disabled={!message.trim() || !scheduledAt || loading}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
        style={{
          background: "linear-gradient(135deg, oklch(0.745 0.142 78 / 0.9), oklch(0.68 0.15 70))",
          color: "oklch(0.224 0.062 263)",
        }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
        {loading ? "Scheduling..." : "Schedule Campaign"}
      </button>
    </div>
  );
}
