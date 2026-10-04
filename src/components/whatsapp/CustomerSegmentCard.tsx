import { useEffect, useState } from "react";
import { Loader2, Users, MapPin, Star, UserX, TrendingUp } from "lucide-react";

interface Segment {
  id: string;
  name: string;
  type: string;
  description: string;
  customer_count: number;
}

const API_BASE = "/api";
function getToken() { return localStorage.getItem("access_token") || ""; }

const SEGMENT_ICONS: Record<string, React.ReactNode> = {
  all: <Users className="h-5 w-5" />,
  premium: <Star className="h-5 w-5" />,
  inactive: <UserX className="h-5 w-5" />,
  city: <MapPin className="h-5 w-5" />,
  spend_above: <TrendingUp className="h-5 w-5" />,
};

const SEGMENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  all: { bg: "oklch(0.224 0.062 263 / 0.08)", text: "oklch(0.224 0.062 263)", border: "oklch(0.224 0.062 263 / 0.2)" },
  premium: { bg: "oklch(0.745 0.142 78 / 0.1)", text: "oklch(0.45 0.08 78)", border: "oklch(0.745 0.142 78 / 0.3)" },
  inactive: { bg: "oklch(0.6 0.21 25 / 0.08)", text: "oklch(0.5 0.15 25)", border: "oklch(0.6 0.21 25 / 0.2)" },
  city: { bg: "oklch(0.62 0.14 155 / 0.08)", text: "oklch(0.42 0.14 155)", border: "oklch(0.62 0.14 155 / 0.25)" },
  spend_above: { bg: "oklch(0.55 0.1 263 / 0.08)", text: "oklch(0.35 0.05 263)", border: "oklch(0.55 0.1 263 / 0.2)" },
};

interface CustomerSegmentCardProps {
  onSegmentSelect?: (segmentId: string) => void;
}

export function CustomerSegmentCard({ onSegmentSelect }: CustomerSegmentCardProps) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API_BASE}/whatsapp/segments`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        setSegments(await r.json());
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, []);

  const handleSelect = (seg: Segment) => {
    setSelected(seg.id === selected ? null : seg.id);
    onSegmentSelect?.(seg.id);
  };

  return (
    <div
      className="rounded-3xl p-6 space-y-4"
      style={{ background: "white", border: "1px solid oklch(0.9 0.012 85)", boxShadow: "0 1px 2px rgba(7,27,59,0.04), 0 8px 24px -8px rgba(7,27,59,0.08)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg"
             style={{ background: "oklch(0.745 0.142 78 / 0.12)" }}>👥</div>
        <div>
          <div className="font-serif text-lg font-semibold" style={{ color: "oklch(0.224 0.062 263)" }}>
            Customer Segments
          </div>
          <div className="text-xs" style={{ color: "oklch(0.55 0.03 263)" }}>
            Live counts from MySQL
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "oklch(0.745 0.142 78)" }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {segments.map((seg) => {
            const colors = SEGMENT_COLORS[seg.type] || SEGMENT_COLORS.all;
            const isSelected = selected === seg.id;
            return (
              <button
                key={seg.id}
                onClick={() => handleSelect(seg)}
                className="flex items-center justify-between rounded-2xl px-4 py-3 text-left transition-all hover:scale-[1.01]"
                style={{
                  background: isSelected ? colors.bg : "oklch(0.97 0.008 85)",
                  border: `1px solid ${isSelected ? colors.border : "oklch(0.92 0.01 85)"}`,
                  boxShadow: isSelected ? "0 4px 12px rgba(7,27,59,0.08)" : "none",
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-xl flex-shrink-0"
                    style={{ background: colors.bg, color: colors.text }}
                  >
                    {SEGMENT_ICONS[seg.type] || <Users className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: "oklch(0.224 0.062 263)" }}>
                      {seg.name}
                    </div>
                    <div className="text-[11px]" style={{ color: "oklch(0.55 0.03 263)" }}>
                      {seg.description}
                    </div>
                  </div>
                </div>
                <div
                  className="ml-2 flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold"
                  style={{ background: colors.bg, color: colors.text }}
                >
                  {seg.customer_count}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
