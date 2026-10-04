import { Wrench, Clock } from "lucide-react";

interface AgentResponseCardProps {
  response: string;
  executedTool?: string | null;
  timestamp?: string;
  compact?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  broadcast_message: "📡 Broadcast",
  send_whatsapp_message: "💬 WhatsApp",
  send_whatsapp_to_phone: "💬 WhatsApp",
  get_segment_count: "👥 Segment Count",
  create_campaign: "📋 Campaign Created",
  list_campaigns: "📋 Campaigns Listed",
  get_customer_details: "👤 Customer Lookup",
  generate_bill: "🧾 Bill Generated",
  generate_invoice_pdf: "📄 PDF Generated",
  predict_next_month_sales: "📈 Sales Forecast",
  predict_customer_churn: "⚠️ Churn Analysis",
  predict_product_demand: "📦 Demand Analysis",
  train_sales_model: "🤖 Model Training",
  train_churn_model: "🤖 Model Training",
  train_demand_model: "🤖 Model Training",
};

function formatTime(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function AgentResponseCard({
  response,
  executedTool,
  timestamp,
  compact = false,
}: AgentResponseCardProps) {
  const toolLabel = executedTool ? (TOOL_LABELS[executedTool] || `🔧 ${executedTool}`) : null;

  return (
    <div
      className="max-w-[90%] space-y-1.5 rounded-2xl rounded-tl-sm p-3.5 shadow-sm"
      style={{
        background: "white",
        border: "1px solid oklch(0.9 0.012 85)",
        fontSize: compact ? "0.8rem" : "0.875rem",
      }}
    >
      {/* Tool badge */}
      {toolLabel && (
        <div
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            background: "oklch(0.745 0.142 78 / 0.12)",
            color: "oklch(0.55 0.08 78)",
            border: "1px solid oklch(0.745 0.142 78 / 0.3)",
          }}
        >
          <Wrench className="h-2.5 w-2.5" />
          {toolLabel}
        </div>
      )}

      {/* Response text */}
      <div
        className="whitespace-pre-wrap leading-relaxed"
        style={{ color: "oklch(0.224 0.062 263)" }}
      >
        {response}
      </div>

      {/* Timestamp */}
      {timestamp && (
        <div
          className="flex items-center gap-1 pt-0.5"
          style={{ color: "oklch(0.65 0.02 263)" }}
        >
          <Clock className="h-2.5 w-2.5" />
          <span className="text-[10px]">{formatTime(timestamp)}</span>
        </div>
      )}
    </div>
  );
}
