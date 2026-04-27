import { Category } from "@/types/category";
import { uid } from "@/utils/finance";

export const DEFAULT_CATEGORIES: Omit<Category, "id">[] = [
  // ── Expense ──────────────────────────────────────────────────────────────
  { name: "Gas",                  type: "expense", vehicleLinked: true },
  { name: "Groceries",            type: "expense" },
  { name: "Dining & Food",        type: "expense" },
  { name: "Shopping",             type: "expense" },
  { name: "Utilities",            type: "expense" },
  { name: "Insurance",            type: "expense" },
  { name: "Subscriptions",        type: "expense" },
  { name: "Entertainment",        type: "expense" },
  { name: "Transportation",       type: "expense" },
  { name: "Medical",              type: "expense" },
  { name: "Home Maintenance",     type: "expense" },
  { name: "Education",            type: "expense" },
  { name: "Clothing",             type: "expense" },
  { name: "Personal Care",        type: "expense" },
  { name: "Car Maintenance",      type: "expense", vehicleLinked: true },
  // ── Business Expense ─────────────────────────────────────────────────────
  { name: "Business Expense",     type: "expense" },
  { name: "CRA Remittance",       type: "expense" },
  { name: "Professional Dev.",    type: "expense" },
  { name: "Office Supplies",      type: "expense" },
  { name: "Software & Tools",     type: "expense" },
  { name: "Phone & Internet",     type: "expense" },
  // ── Income ───────────────────────────────────────────────────────────────
  { name: "Employment Income",    type: "income" },
  { name: "Business Income",      type: "income" },
  { name: "Investment Return",    type: "income" },
  { name: "Other Income",         type: "income" },
];

export function seedDefaultCategories(): Category[] {
  return DEFAULT_CATEGORIES.map((c) => ({ ...c, id: uid() }));
}
