/**
 * prediction-api.ts
 * =================
 * Typed API helpers for the JewelMind demand prediction endpoints.
 * All calls require a valid JWT in localStorage (same pattern as api-service.ts).
 *
 * Endpoints:
 *   POST  /api/predict/all      Run demand + sales models
 *   GET   /api/predict/history  Fetch prediction history
 *   GET   /api/predict/chart    Fetch chart-ready aggregated data
 *   GET   /api/predict/status   Model load status
 *   GET   /api/predict/labels   Category + festival encoder labels
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PredictionInput {
  date: string;               // YYYY-MM-DD
  product_id?: string;
  category: string;
  gold_rate: number;
  festival: string;
  wedding_season: 0 | 1;
  current_stock: number;
  previous_sales: number;
}

export interface PredictionOutput {
  predicted_demand: number;
  predicted_sales: number | null;
  category: string;
  festival: string;
  prediction_timestamp: string;
}

export interface PredictionHistoryItem {
  id: string;
  product_id: string | null;
  category: string;
  festival: string | null;
  gold_rate: number | null;
  predicted_demand: number | null;
  predicted_sales: number | null;
  prediction_date: string | null;
  created_at: string;
}

export interface PredictionChartData {
  demand_trend: { date: string; demand: number }[];
  sales_trend: { date: string; sales: number }[];
  by_category: { category: string; demand: number; sales: number }[];
  by_festival: { festival: string; demand: number }[];
}

export interface ModelStatus {
  demand_model: "ready" | "not_found";
  sales_model: "ready" | "not_found";
  category_encoder: "ready" | "not_found";
  festival_encoder: "ready" | "not_found";
}

export interface EncoderLabels {
  categories: string[];
  festivals: string[];
}

// ─── Internal fetch helper ─────────────────────────────────────────────────────

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("access_token");
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
}

async function predictFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/predict${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/auth";
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err.detail === "string"
        ? err.detail
        : JSON.stringify(err.detail) || "Prediction API request failed"
    );
  }
  return res.json() as Promise<T>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run both the demand and sales models.
 * Result is automatically persisted to prediction_history by the backend.
 */
export async function runPrediction(input: PredictionInput): Promise<PredictionOutput> {
  return predictFetch<PredictionOutput>("/all", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Fetch the last N predictions made by the current user.
 */
export async function getPredictionHistory(limit = 30): Promise<PredictionHistoryItem[]> {
  return predictFetch<PredictionHistoryItem[]>(`/history?limit=${limit}`);
}

/**
 * Fetch chart-ready aggregated prediction data.
 */
export async function getPredictionChartData(): Promise<PredictionChartData> {
  return predictFetch<PredictionChartData>("/chart");
}

/**
 * Check which .joblib model files are loaded and ready.
 */
export async function getModelStatus(): Promise<ModelStatus> {
  return predictFetch<ModelStatus>("/status");
}

/**
 * Get category and festival labels from the LabelEncoders.
 * Falls back to hardcoded lists when models are not yet loaded.
 */
export async function getEncoderLabels(): Promise<EncoderLabels> {
  return predictFetch<EncoderLabels>("/labels");
}
