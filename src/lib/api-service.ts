import type { Customer, Bill, Expense, GoldRate, OwnerProfile } from "./firebase-types";

const API_BASE = "/api";

function getHeaders() {
  const token = localStorage.getItem("access_token");
  return {
    "Content-Type": "application/json",
    "Authorization": token ? `Bearer ${token}` : ""
  };
}

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers,
    }
  });
  
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/auth";
    }
    const errorData = await res.json().catch(() => ({}));
    const detail = errorData.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : detail
          ? JSON.stringify(detail)
          : "API request failed",
    );
  }
  return res.json();
}

// ─── PROFILE ─────────────────────────────────────────────────────────────

export async function getOwnerProfile(): Promise<OwnerProfile | null> {
  try {
    return await fetchAPI("/users/me");
  } catch (e) {
    return null;
  }
}

export async function saveOwnerProfile(data: {
  ownerName: string;
  shopName: string;
  gstin?: string;
  city?: string;
  phone?: string;
  address?: string;
}) {
  return fetchAPI("/users/me", {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

// ─── CUSTOMERS ─────────────────────────────────────────────────────────────

export async function getCustomers(): Promise<Customer[]> {
  return fetchAPI("/customers");
}

export async function getCustomer(id: string): Promise<Customer | null> {
  try {
    return await fetchAPI(`/customers/${id}`);
  } catch {
    return null;
  }
}

export async function addCustomer(data: Omit<Customer, "id" | "customerSince" | "visits">): Promise<string> {
  const res = await fetchAPI("/customers", {
    method: "POST",
    body: JSON.stringify(data)
  });
  return res.id;
}

export async function updateCustomer(id: string, data: Partial<Customer>) {
  return fetchAPI(`/customers/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function sendWhatsAppToCustomer(customerId: string, message: string) {
  return fetchAPI(`/whatsapp/send/${customerId}`, {
    method: "POST",
    body: JSON.stringify({ message })
  });
}

export async function getBillsForCustomer(customerId: string): Promise<Bill[]> {
  const bills = await getBills();
  return bills.filter(b => b.customerId === customerId);
}

// ─── BILLS ─────────────────────────────────────────────────────────────

export async function getBills(): Promise<Bill[]> {
  return fetchAPI("/invoices");
}

export async function getProducts() {
  return fetchAPI("/products");
}

export async function getBill(id: string): Promise<Bill | null> {
  try {
    return await fetchAPI(`/invoices/${id}`);
  } catch {
    return null;
  }
}

export async function addBill(data: Omit<Bill, "id">): Promise<string> {
  const res = await fetchAPI("/invoices", {
    method: "POST",
    body: JSON.stringify(data)
  });
  return res.id;
}

export async function deleteBill(id: string): Promise<void> {
  await fetchAPI(`/invoices/${id}`, { method: "DELETE" });
}

// ─── GOLD RATES ─────────────────────────────────────────────────────────────

export async function refreshGoldRates(): Promise<void> {
  const token = localStorage.getItem("access_token");
  if (!token) {
    return;
  }

  try {
    await fetchAPI("/gold_rates/update", {
      method: "POST",
    });
  } catch {
    // Ignore refresh failures here; the calling code can still use cached or existing rates.
  }
}

export async function getLatestGoldRate(): Promise<{ rate22k: number; rate24k: number; rateSilver: number } | null> {
  await refreshGoldRates();
  try {
    return await fetchAPI("/gold_rates/today");
  } catch {
    // Fallback: get all rates and return the first (latest)
    try {
      const rates = await fetchAPI("/gold_rates");
      return rates.length > 0 ? rates[0] : null;
    } catch {
      return null;
    }
  }
}


export async function getExpenses(): Promise<Expense[]> {
  return fetchAPI("/expenses");
}

export async function addExpense(data: Omit<Expense, "id">): Promise<string> {
  const res = await fetchAPI("/expenses", {
    method: "POST",
    body: JSON.stringify(data)
  });
  return res.id;
}

export async function deleteExpense(id: string) {
  await fetchAPI(`/expenses/${id}`, { method: "DELETE" });
}

// ─── GOLD RATES ─────────────────────────────────────────────────────────────

export async function getGoldRates(): Promise<GoldRate[]> {
  await refreshGoldRates();
  return fetchAPI("/gold_rates");
}

export async function addGoldRate(data: Omit<GoldRate, "id">): Promise<string> {
  const res = await fetchAPI("/gold_rates", {
    method: "POST",
    body: JSON.stringify(data)
  });
  return res.id;
}

// ─── DASHBOARD METRICS ──────────────────────────────────────────────────

export function computeDashboardMetrics(bills: Bill[], expenses: Expense[], rates: GoldRate[]) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStr = today.slice(0, 7); // YYYY-MM

  const todaySales = bills
    .filter((b) => b.date.startsWith(today))
    .reduce((sum, b) => sum + b.amount, 0);

  const monthlyRevenue = bills
    .filter((b) => b.date.startsWith(monthStr))
    .reduce((sum, b) => sum + b.amount, 0);

  const totalRevenue = bills.reduce((sum, b) => sum + b.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const pendingPayments = bills.reduce((sum, b) => sum + (b.balanceAmount ?? 0), 0);
  const profit = totalRevenue - totalExpenses;

  const sortedRates = [...rates].sort((a, b) => b.date.localeCompare(a.date));
  const latestGold = sortedRates.length > 0 ? sortedRates[0] : null;

  return {
    todaySales,
    monthlyRevenue,
    totalRevenue,
    totalExpenses,
    profit,
    pendingPayments,
    latestGold,
  };
}

// ─── ML PREDICTIONS ────────────────────────────────────────────────────────

export async function getMLStatus() {
  return fetchAPI("/ml-status");
}

export async function trainMLModel(modelType: "sales" | "churn" | "demand") {
  return fetchAPI(`/train-${modelType}-model`, { method: "POST" });
}

export async function predictSales(monthsAhead: number = 3) {
  return fetchAPI("/predict-sales", {
    method: "POST",
    body: JSON.stringify({ months_ahead: monthsAhead })
  });
}

export async function predictChurn() {
  return fetchAPI("/predict-churn", { method: "POST" });
}

export async function predictDemand() {
  return fetchAPI("/predict-demand", { method: "POST" });
}
