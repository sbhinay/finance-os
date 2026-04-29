import type { Transaction, TransactionSubType, TransactionType } from "@/types/transaction";

type RawTransaction = Omit<Partial<Transaction>, "type" | "subType"> & {
  type?: string;
  subType?: string;
};

function asTransactionSubType(value: string | undefined): TransactionSubType | undefined {
  if (!value) return undefined;
  return value as TransactionSubType;
}

export function normalizeTransactionShape<T extends RawTransaction>(tx: T): Transaction {
  const normalizedType = tx.type === "credit_card_payment" ? "transfer" : (tx.type as TransactionType);
  const normalizedSubType =
    tx.type === "credit_card_payment"
      ? "cc_payment"
      : asTransactionSubType(tx.subType);

  const isTransferLike = normalizedType === "transfer";
  const isLegacyCardPayment = tx.type === "credit_card_payment" || normalizedSubType === "cc_payment";

  return {
    ...tx,
    type: normalizedType,
    subType: normalizedSubType,
    categoryId: isTransferLike ? undefined : tx.categoryId,
    linkedVehicleId: isLegacyCardPayment ? undefined : tx.linkedVehicleId,
    linkedPropertyId: isLegacyCardPayment ? undefined : tx.linkedPropertyId,
    odometer: isLegacyCardPayment ? undefined : tx.odometer,
    mode: isLegacyCardPayment ? (tx.mode ?? "Bank Transfer") : tx.mode,
  } as Transaction;
}

export function normalizeTransactionCollection(transactions: RawTransaction[]): Transaction[] {
  return transactions.map(normalizeTransactionShape);
}
