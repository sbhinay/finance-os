import type { Transaction, TransactionSubType, TransactionType } from "@/types/transaction";
import { inferTransactionPurpose } from "@/utils/transactionSemantics";

type RawTransaction = Omit<Partial<Transaction>, "type" | "subType"> & {
  type?: string;
  subType?: string;
};

function asTransactionSubType(value: string | undefined): TransactionSubType | undefined {
  if (!value) return undefined;
  return value as TransactionSubType;
}

export function normalizeText(value: string | undefined): string | undefined {
  if (!value) return value;

  return value
    .replace(/Ã¢â‚¬â€|Ã¢â‚¬â€�|Ã¢â‚¬â€œ|â€”|â€“|—|–/g, " - ")
    .replace(/Ã¢â‚¬Ëœ|Ã¢â‚¬â„¢|â€˜|â€™|‘|’/g, "'")
    .replace(/Ã¢â‚¬Å“|Ã¢â‚¬Â|â€œ|â€|“|”/g, '"')
    .replace(/Ã¢â‚¬Â¦|â€¦|…/g, "...")
    .replace(/Ã‚Â /g, " ")
    .replace(/Â /g, " ")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalizeTransactionShape<T extends RawTransaction>(tx: T): Transaction {
  const normalizedType = tx.type === "credit_card_payment" ? "transfer" : (tx.type as TransactionType);
  const normalizedSubType =
    tx.type === "credit_card_payment"
      ? "cc_payment"
      : asTransactionSubType(tx.subType);

  const isTransferLike = normalizedType === "transfer";
  const isLegacyCardPayment = tx.type === "credit_card_payment" || normalizedSubType === "cc_payment";

  const normalized = {
    ...tx,
    date: tx.date?.slice(0, 10) ?? tx.createdAt?.slice(0, 10) ?? "",
    type: normalizedType,
    subType: normalizedSubType,
    description: normalizeText(tx.description) ?? "",
    notes: normalizeText(tx.notes),
    categoryId: isTransferLike ? undefined : tx.categoryId,
    linkedVehicleId: isLegacyCardPayment ? undefined : tx.linkedVehicleId,
    linkedPropertyId: isLegacyCardPayment ? undefined : tx.linkedPropertyId,
    odometer: isLegacyCardPayment ? undefined : tx.odometer,
    mode: isLegacyCardPayment ? (tx.mode ?? "Bank Transfer") : tx.mode,
  } as Transaction;

  return {
    ...normalized,
    purpose: inferTransactionPurpose(normalized),
  };
}

export function normalizeTransactionCollection(transactions: RawTransaction[]): Transaction[] {
  return transactions
    .map(normalizeTransactionShape)
    .filter((tx) => !(tx.type === "adjustment" && (tx.subType as string) === "reconciliation"));
}
