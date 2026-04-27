import { Account } from "@/types/account";
import { TransactionType } from "@/types/transaction";

// ─── Account Rules ────────────────────────────────────────────────────────────
export function validateNewAccount(
  name: string,
  existingAccounts: Account[]
): string | null {
  if (!name || name.trim() === "") return "Account name is required";
  const duplicate = existingAccounts.find(
    (acc) => acc.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) return "Account with this name already exists";
  return null;
}

// ─── Transaction Rules ────────────────────────────────────────────────────────
export function validateTransaction(
  type: TransactionType,
  amount: number,
  sourceId: string,
  destinationId?: string
): string | null {
  if (!sourceId) return "Source account is required";
  if (!amount || amount <= 0) return "Amount must be greater than 0";
  if (type === "transfer" && !destinationId) return "Destination required for transfers";
  if (type === "transfer" && sourceId === destinationId)
    return "Cannot transfer to the same account";
  return null;
}

// ─── Invoice Rules ────────────────────────────────────────────────────────────
export function validateInvoice(
  hours: number,
  hourlyRate: number,
  workMonth: number,
  workYear: number
): string | null {
  if (!hours || hours <= 0) return "Hours must be greater than 0";
  if (!hourlyRate || hourlyRate <= 0) return "Hourly rate must be greater than 0";
  if (!workMonth || workMonth < 1 || workMonth > 12) return "Invalid work month";
  if (!workYear || workYear < 2020) return "Invalid work year";
  return null;
}
