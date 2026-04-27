import { TransactionType } from "@/types/transaction";

export function validateTransaction(
  type: TransactionType,
  amount: number,
  sourceId: string,
  destinationId?: string
): string | null {
  if (!sourceId) return "Source required";

  if (!amount || amount <= 0) return "Amount must be > 0";

  if (type === "transfer" && !destinationId)
    return "Destination required";

  if (type === "transfer" && sourceId === destinationId)
    return "Cannot transfer to same account";

  return null;
}