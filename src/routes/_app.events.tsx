import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fmtDate } from "@/lib/mock-data";
import { useState } from "react";
import { CalendarDays, MapPin } from "lucide-react";

const events = [
  { id: "E1", title: "India International Jewellery Show", date: "2026-08-04", city: "Mumbai", region: "India", tag: "Trade Show" },
  { id: "E2", title: "Couture Week Chennai", date: "2026-09-12", city: "Chennai", region: "Tamil Nadu", tag: "Bridal" },
  { id: "E3", title: "Madurai Gold Expo", date: "2026-10-02", city: "Madurai", region: "Tamil Nadu", tag: "Retail" },
  { id: "E4", title: "Vicenzaoro World Jewellery", date: "2027-01-19", city: "Vicenza", region: "Global", tag: "Global" },
  { id: "E5", title: "Chennai Diamond Forum", date: "2026-11-22", city: "Chennai", region: "Chennai", tag: "Diamond" },
];

export const Route = createFileRoute("/_app/events")({
  component: EventsPage,
  head: () => ({ meta: [{ title: "Events · JewelMind AI" }] }),
});

function EventsPage() {
  const [region, setRegion] = useState("All");
  const filtered = events.filter(e => region === "All" || e.region === region || e.city === region);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Calendar"
        title="Jewelry Industry Events"
        description="Trade shows, bridal forums and gem exhibitions worth attending."
        actions={
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="w-44 rounded-2xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["All","Global","India","Tamil Nadu","Chennai","Madurai"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList className="rounded-2xl bg-secondary">
          <TabsTrigger value="list" className="rounded-xl">List View</TabsTrigger>
          <TabsTrigger value="calendar" className="rounded-xl">Calendar View</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(e => (
            <Card key={e.id} className="luxe-card group overflow-hidden rounded-3xl border-border/60 p-0 transition hover:-translate-y-1 hover:shadow-lg">
              <div className="gold-gradient relative h-32">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.4),transparent)]" />
                <div className="absolute right-4 top-4 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-navy">{e.tag}</div>
                <div className="absolute bottom-3 left-4 font-serif text-3xl text-navy">{new Date(e.date).getDate()}</div>
              </div>
              <div className="p-5">
                <h3 className="font-serif text-xl">{e.title}</h3>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(e.date)}</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{e.city} · {e.region}</span>
                </div>
                <button className="mt-4 text-xs font-medium text-[var(--gold)] transition group-hover:underline">Reserve a slot →</button>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="calendar">
          <Card className="luxe-card rounded-3xl border-border/60 p-6">
            <div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} className="py-2 font-medium">{d}</div>)}
              {Array.from({ length: 35 }, (_, i) => {
                const day = i - 2;
                const ev = filtered.find(e => new Date(e.date).getDate() === day);
                return (
                  <div key={i} className={`relative aspect-square rounded-xl border border-border/60 p-1 text-left text-xs ${day < 1 ? "opacity-30" : ""}`}>
                    <div>{day > 0 && day <= 31 ? day : ""}</div>
                    {ev && <div className="absolute inset-x-1 bottom-1 truncate rounded-md bg-[var(--gold)]/20 px-1.5 py-0.5 text-[10px] text-[var(--gold)]">{ev.title}</div>}
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
