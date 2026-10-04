// TypeScript types for all backend data structures

export interface OwnerProfile {
  ownerName: string;
  shopName: string;
  gstin?: string;
  city?: string;
  phone?: string;
  address?: string;
  createdAt: string; // ISO date string
  email: string;
}

export type PaymentStatus = "Full" | "Partial" | "Pending";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  dob?: string;
  address: string;
  city: string;
  customerSince: string;
  visits: number;
}

export interface BillItem {
  id: string;
  productName: string;
  productId?: string;
  category?: string;
  purity?: string;
  quantity: number;
  rate?: number;
  price?: number;
  weight: number;
  makingCharge: number;
  goldRate?: number;
  goldValue?: number;
  stoneCharge: number;
  wastagePercent: number;
  wastageAmount?: number;
  discount: number;
  gstPercent: number;
  gstAmount?: number;
  subtotal?: number;
  total?: number;
}

export interface Bill {
  id: string;
  customerId?: string;
  customerName: string;
  phoneNumber?: string;
  customerEmail?: string;
  customerAddress?: string;
  billNumber: string;
  invoiceNumber?: string;
  productName: string;
  category: string;
  weight: number;
  purity: string;
  amount: number;            // grand total (used for display)
  paidAmount: number;
  balanceAmount: number;
  paymentStatus: PaymentStatus;
  dueDate?: string;
  date: string;              // ISO date
  gst?: number;
  totalAmount?: number;
  paymentMethod?: string;
  status?: string;
  subtotalAmount?: number;
  goldValueTotal?: number;
  makingChargeTotal?: number;
  stoneChargeTotal?: number;
  discountTotal?: number;
  goldRateUsed?: number;
  createdAt?: string;
  items?: BillItem[];
}

export interface Expense {
  id: string;
  expenseType: string;
  amount: number;
  date: string; // ISO date
  notes?: string;
}

export interface GoldRate {
  id: string;
  rate22k: number;
  rate24k: number;
  rateSilver: number;
  date: string; // ISO date YYYY-MM-DD
  lastUpdated?: string;
  source?: string;
  status?: string;
  warning?: string;
}
