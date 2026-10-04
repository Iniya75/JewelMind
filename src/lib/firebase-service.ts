import {
  doc, getDoc, setDoc, collection, addDoc, getDocs,
  updateDoc, deleteDoc, query, orderBy, Timestamp, where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { OwnerProfile, Customer, Bill, Expense, GoldRate } from "./firebase-types";

// ─── Owner Profile ─────────────────────────────────────────────────────────

export async function getOwnerProfile(userId: string): Promise<OwnerProfile | null> {
  const ref = doc(db, "users", userId);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as OwnerProfile) : null;
}

export async function saveOwnerProfile(userId: string, profile: OwnerProfile): Promise<void> {
  await setDoc(doc(db, "users", userId), profile, { merge: true });
}

// ─── Customers ─────────────────────────────────────────────────────────────

function customersCol(userId: string) {
  return collection(db, "users", userId, "customers");
}

export async function getCustomers(userId: string): Promise<Customer[]> {
  const q = query(customersCol(userId), orderBy("customerSince", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer));
}

export async function getCustomer(userId: string, customerId: string): Promise<Customer | null> {
  const ref = doc(db, "users", userId, "customers", customerId);
  const snap = await getDoc(ref);
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Customer) : null;
}

export async function addCustomer(userId: string, customer: Omit<Customer, "id">): Promise<string> {
  const ref = await addDoc(customersCol(userId), customer);
  return ref.id;
}

export async function updateCustomer(
  userId: string,
  customerId: string,
  data: Partial<Omit<Customer, "id">>
): Promise<void> {
  await updateDoc(doc(db, "users", userId, "customers", customerId), data);
}

// ─── Bills ─────────────────────────────────────────────────────────────────

function billsCol(userId: string) {
  return collection(db, "users", userId, "bills");
}

export async function getBills(userId: string): Promise<Bill[]> {
  const q = query(billsCol(userId), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Bill));
}

export async function getBillsForCustomer(userId: string, customerId: string): Promise<Bill[]> {
  const q = query(billsCol(userId), where("customerId", "==", customerId), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Bill));
}

export async function addBill(userId: string, bill: Omit<Bill, "id">): Promise<string> {
  const ref = await addDoc(billsCol(userId), bill);
  return ref.id;
}

// ─── Expenses ──────────────────────────────────────────────────────────────

function expensesCol(userId: string) {
  return collection(db, "users", userId, "expenses");
}

export async function getExpenses(userId: string): Promise<Expense[]> {
  const q = query(expensesCol(userId), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense));
}

export async function addExpense(userId: string, expense: Omit<Expense, "id">): Promise<string> {
  const ref = await addDoc(expensesCol(userId), expense);
  return ref.id;
}

export async function deleteExpense(userId: string, expenseId: string): Promise<void> {
  await deleteDoc(doc(db, "users", userId, "expenses", expenseId));
}

// ─── Gold Rates ─────────────────────────────────────────────────────────────

function goldRatesCol(userId: string) {
  return collection(db, "users", userId, "gold_rates");
}

export async function getGoldRates(userId: string): Promise<GoldRate[]> {
  const q = query(goldRatesCol(userId), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as GoldRate));
}

export async function addGoldRate(userId: string, rate: Omit<GoldRate, "id">): Promise<string> {
  const ref = await addDoc(goldRatesCol(userId), rate);
  return ref.id;
}

// ─── Dashboard Metrics ──────────────────────────────────────────────────────

export function computeDashboardMetrics(bills: Bill[], expenses: Expense[], goldRates: GoldRate[]) {
  const today = new Date().toISOString().slice(0, 10);
  const nowDate = new Date();
  const startOfWeek = new Date(nowDate);
  startOfWeek.setDate(nowDate.getDate() - nowDate.getDay());
  const weekStr = startOfWeek.toISOString().slice(0, 10);
  const monthStr = today.slice(0, 7); // YYYY-MM

  let todaySales = 0;
  let weeklySales = 0;
  let monthlyRevenue = 0;
  let totalRevenue = 0;
  let pendingPayments = 0;

  for (const b of bills) {
    totalRevenue += b.amount;
    if (b.date === today) todaySales += b.amount;
    if (b.date >= weekStr) weeklySales += b.amount;
    if (b.date.startsWith(monthStr)) monthlyRevenue += b.amount;
    if (b.paymentStatus !== "Full") pendingPayments += b.balanceAmount;
  }

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const profit = totalRevenue - totalExpenses;

  const latestGold = goldRates[0] ?? null;

  return {
    todaySales,
    weeklySales,
    monthlyRevenue,
    totalRevenue,
    totalExpenses,
    profit,
    pendingPayments,
    latestGold,
  };
}
