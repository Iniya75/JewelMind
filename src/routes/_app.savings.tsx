import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useState } from "react";
import { fmtINR } from "@/lib/mock-data";
import { PiggyBank } from "lucide-react";

export const Route = createFileRoute("/_app/savings")({
  component: SavingsPage,
  head: () => ({ meta: [{ title: "Savings Planner · JewelMind AI" }] }),
});

function SavingsPage() {
  const [goal, setGoal] = useState(1500000);
  const [months, setMonths] = useState([12]);
  const [plan, setPlan] = useState<{ goal: number; months: number; monthly: number } | null>(null);

  function generate() {
    const m = months[0];
    setPlan({ goal, months: m, monthly: Math.round(goal / m) });
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Planner" title="Savings Planner" description="Plan how to reinvest profits into stock, expansion, or tax provisioning." />

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="luxe-card rounded-3xl border-border/60 p-6">
          <h3 className="font-serif text-xl">Goal</h3>
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Target Amount (₹)</label>
              <Input type="number" value={goal} onChange={(e) => setGoal(Number(e.target.value))} className="mt-1.5 rounded-xl" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Horizon · {months[0]} months</label>
              <Slider value={months} onValueChange={setMonths} min={3} max={36} step={1} className="mt-3" />
            </div>
            <Button onClick={generate} className="w-full rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90">
              Generate Plan
            </Button>
          </div>
        </Card>

        {plan ? (
          <Card className="luxe-card navy-gradient rounded-3xl border-border/60 p-8 text-[var(--navy-foreground)]">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--gold)]">Recommendation</div>
            <div className="mt-3 font-serif text-4xl font-semibold">
              {fmtINR(plan.monthly)}<span className="text-base text-white/60"> / month</span>
            </div>
            <p className="mt-3 text-sm text-white/80">
              Set aside {fmtINR(plan.monthly)} every month to reach {fmtINR(plan.goal)} in {plan.months} months.
              Based on your last 6 months of profit, this is ~{Math.min(100, Math.round((plan.monthly / 690000) * 100))}% of net profit.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-white/80">
              <li>• Auto-debit on the 5th of every month</li>
              <li>• Park in a 7-day liquid fund (~6.4% p.a.)</li>
              <li>• Review quarterly with AI Advisor</li>
            </ul>
          </Card>
        ) : (
          <Card className="luxe-card flex flex-col items-center justify-center rounded-3xl border-dashed border-border/60 p-10 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-[var(--gold)]">
              <PiggyBank className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-serif text-xl">Your plan will appear here</h3>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Set a target amount and horizon on the left, then click <strong>Generate Plan</strong> to see your monthly savings recommendation.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
