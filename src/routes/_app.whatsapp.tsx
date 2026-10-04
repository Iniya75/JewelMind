import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { BroadcastMessageCard } from "@/components/whatsapp/BroadcastMessageCard";
import { CampaignHistoryTable } from "@/components/whatsapp/CampaignHistoryTable";
import { ScheduleMessageCard } from "@/components/whatsapp/ScheduleMessageCard";

export const Route = createFileRoute("/_app/whatsapp")({
  component: WhatsAppAutomationPage,
  head: () => ({ meta: [{ title: "WhatsApp Automation · JewelMind AI" }] }),
});

function WhatsAppAutomationPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [config, setConfig] = useState<{
    business_name: string;
    business_number: string;
    status: string;
  } | null>(null);

  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    const token = localStorage.getItem("access_token") || "";
    fetch("/api/whatsapp-config/status", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    .then(res => {
      if (!res.ok) throw new Error();
      return res.json();
    })
    .then(data => setConfig(data))
    .catch(() => {});
  }, [refreshKey]);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <PageHeader
        eyebrow="Automation"
        title="WhatsApp Automation"
        description="Reach your customers instantly with targeted broadcasts and scheduled campaigns."
        actions={
          <div className="flex items-center gap-2">
            {config && config.status === "Connected" ? (
              <>
                <div
                  className="flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold"
                  style={{
                    background: "oklch(0.62 0.14 155 / 0.1)",
                    border: "1px solid oklch(0.62 0.14 155 / 0.3)",
                    color: "oklch(0.42 0.14 155)",
                  }}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Meta WhatsApp Connected: {config.business_number}
                </div>
                <Button variant="outline" size="sm" asChild className="rounded-2xl border-border/60 hover:bg-secondary text-white bg-slate-900">
                  <Link to="/whatsapp-integration">Manage</Link>
                </Button>
              </>
            ) : (
              <>
                <div
                  className="flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold bg-zinc-500/10 border border-zinc-500/20 text-zinc-400"
                >
                  <span className="h-2 w-2 rounded-full bg-zinc-500" />
                  WhatsApp Disconnected
                </div>
                <Button variant="outline" size="sm" asChild className="rounded-2xl border-[var(--gold)]/40 hover:bg-[var(--gold)]/10 text-[var(--gold)]">
                  <Link to="/whatsapp-integration">Connect Meta WhatsApp</Link>
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Main Grid: Broadcast + Schedule */}
      <div className="grid gap-6 lg:grid-cols-[1fr,380px]">
        {/* Left: Broadcast */}
        <BroadcastMessageCard onBroadcastComplete={refresh} />

        {/* Right: Schedule */}
        <div className="space-y-6">
          <ScheduleMessageCard onScheduled={refresh} />
        </div>
      </div>

      {/* Campaign History */}
      <CampaignHistoryTable refreshKey={refreshKey} />
    </div>
  );
}
