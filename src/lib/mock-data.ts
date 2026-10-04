// ─── Utility types (still used for type compatibility) ─────────────────────

export type PaymentStatus = "Full" | "Partial" | "Pending";

// ─── Jewelry Categories ──────────────────────────────────────────────────────

export const JEWELRY_CATEGORIES = [
  "Chains", "Mangalsutra", "Earrings", "Bangles", "Bracelets", "Rings", "Necklaces",
  "Pendants", "Nose Pins", "Anklets", "Temple Jewellery", "Bridal Sets",
  "Diamond Jewellery", "Silver Jewellery", "Kids Jewellery", "Other",
];

// ─── Formatting helpers ──────────────────────────────────────────────────────

export const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
