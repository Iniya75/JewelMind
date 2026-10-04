import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Clock } from "lucide-react";
import { useState } from "react";

const insights = [
  { id: 1, title: "How AI is reshaping jewelry retail in 2026", cat: "AI", read: "6 min", excerpt: "From inventory forecasting to hyper-personal WhatsApp campaigns, AI is the new master craftsman." },
  { id: 2, title: "BIS hallmarking: the 6-digit HUID compliance guide", cat: "Compliance", read: "8 min", excerpt: "A practical walkthrough for retailers across Tamil Nadu, with templates and checklists." },
  { id: 3, title: "Gold at ₹7,300 — what retailers should do next", cat: "Gold Market", read: "4 min", excerpt: "Hedging, scheme planning, and customer communication when prices rally." },
  { id: 4, title: "Operational excellence in boutique showrooms", cat: "Operations", read: "5 min", excerpt: "Floor flow, staff scripts, and the invisible details that drive ticket size." },
  { id: 5, title: "Festive marketing playbook: Diwali to Akshaya Tritiya", cat: "Marketing", read: "7 min", excerpt: "Channel mix, creative templates, and AI-generated personalized offers." },
];

export const Route = createFileRoute("/_app/insights")({
  component: InsightsPage,
  head: () => ({ meta: [{ title: "Industry Insights · JewelMind AI" }] }),
});

const CATS = ["All","AI","Compliance","Operations","Marketing","Gold Market"];

function InsightsPage() {
  const [cat, setCat] = useState("All");
  const items = insights.filter(i => cat === "All" || i.cat === cat);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Editorial" title="Industry Insights" description="Curated reading for jewelry retail leaders." />

      <div className="flex flex-wrap gap-2">
        {CATS.map(c => (
          <button key={c} onClick={() => setCat(c)} className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
            cat === c ? "border-[var(--gold)] bg-[var(--gold)] text-navy" : "border-border bg-card hover:border-[var(--gold)]/50"
          }`}>{c}</button>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((i, idx) => (
          <article key={i.id} className="group relative overflow-hidden rounded-3xl border border-white/5 p-7 text-white transition hover:-translate-y-1"
            style={{
              background: idx % 3 === 0
                ? "linear-gradient(160deg,#0B244E,#1B0A3A)"
                : idx % 3 === 1
                ? "linear-gradient(160deg,#1A0F2E,#3A1B22)"
                : "linear-gradient(160deg,#071B3B,#2A1A0A)",
            }}>
            <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[var(--gold)]/20 blur-3xl transition group-hover:bg-[var(--gold)]/30" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--gold)]">{i.cat}</div>
              <h3 className="mt-4 font-serif text-2xl leading-tight">{i.title}</h3>
              <p className="mt-3 text-sm text-white/70">{i.excerpt}</p>
              <div className="mt-6 flex items-center justify-between text-xs text-white/60">
                <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{i.read} read</span>
                <span className="text-[var(--gold)] transition group-hover:underline">Read article →</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
