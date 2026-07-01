import type { Category } from "@/types/category";
import type { StatementExtractionResult } from "@/types/statementScanner";

export interface ScannerAccountHint {
  id: string;
  name: string;
  kind: "account" | "card";
  last4?: string;
}

export interface ScannerImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string;
}

export interface StatementExtractionInput {
  images: ScannerImage[];
  categories: Pick<Category, "id" | "name" | "type">[];
  accounts: ScannerAccountHint[];
}

export interface StatementScannerProvider {
  extract(input: StatementExtractionInput): Promise<StatementExtractionResult>;
}

export function parseExtractionJson(text: string): Omit<StatementExtractionResult, "provider" | "model"> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value = JSON.parse(cleaned) as { accountHint?: unknown; transactions?: unknown };
  if (!Array.isArray(value.transactions)) throw new Error("Provider response did not contain a transaction array.");

  const allowedPurposes = new Set([
    "general_expense",
    "general_income",
    "purchase_refund",
    "bank_transfer",
    "credit_card_payment",
    "loc_draw",
  ]);
  const allowedConfidence = new Set(["high", "medium", "low"]);
  const transactions = value.transactions.map((raw, index) => {
    const row = raw as Record<string, unknown>;
    const date = String(row.date ?? "").slice(0, 10);
    const description = String(row.description ?? "").trim();
    const amount = Number(row.amount);
    const purpose = String(row.purpose ?? "");
    const confidence = String(row.confidence ?? "low");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Row ${index + 1} has an invalid date.`);
    if (!description) throw new Error(`Row ${index + 1} has no description.`);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Row ${index + 1} has an invalid amount.`);
    if (!allowedPurposes.has(purpose)) throw new Error(`Row ${index + 1} has an unsupported purpose.`);
    return {
      date,
      description,
      amount: Math.round(amount * 100) / 100,
      purpose: purpose as StatementExtractionResult["transactions"][number]["purpose"],
      suggestedCategoryId: row.suggestedCategoryId ? String(row.suggestedCategoryId) : undefined,
      confidence: (allowedConfidence.has(confidence) ? confidence : "low") as StatementExtractionResult["transactions"][number]["confidence"],
    };
  });

  return {
    accountHint: typeof value.accountHint === "string" ? value.accountHint.trim() || undefined : undefined,
    transactions,
  };
}
