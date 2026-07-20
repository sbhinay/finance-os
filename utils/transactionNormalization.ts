import type { Transaction, TransactionSubType, TransactionType } from "@/types/transaction";
import { inferTransactionPurpose } from "@/utils/transactionSemantics";

const fromCodes = (...codes: number[]) => String.fromCharCode(...codes);

const dashLikeText = [
  fromCodes(0x00c3, 0x00a2, 0x00e2, 0x201a, 0x00ac, 0x00e2, 0x20ac, 0x009d),
  fromCodes(0x00c3, 0x00a2, 0x00e2, 0x201a, 0x00ac, 0x00e2, 0x20ac, 0xfffd),
  fromCodes(0x00c3, 0x00a2, 0x00e2, 0x201a, 0x00ac, 0x00e2, 0x20ac, 0x0153),
  fromCodes(0x00e2, 0x20ac, 0x201d),
  fromCodes(0x00e2, 0x20ac, 0x201c),
  fromCodes(0x2014),
  fromCodes(0x2013),
];

const apostropheLikeText = [
  fromCodes(0x00c3, 0x00a2, 0x00e2, 0x201a, 0x00ac, 0x00cb, 0x0153),
  fromCodes(0x00c3, 0x00a2, 0x00e2, 0x201a, 0x00ac, 0x00e2, 0x201e, 0x00a2),
  fromCodes(0x00e2, 0x20ac, 0x02dc),
  fromCodes(0x00e2, 0x20ac, 0x2122),
  fromCodes(0x2018),
  fromCodes(0x2019),
];

const quoteLikeText = [
  fromCodes(0x00c3, 0x00a2, 0x00e2, 0x201a, 0x00ac, 0x00c5, 0x201c),
  fromCodes(0x00c3, 0x00a2, 0x00e2, 0x201a, 0x00ac, 0x00c2, 0x009d),
  fromCodes(0x00e2, 0x20ac, 0x0153),
  fromCodes(0x00e2, 0x20ac, 0x009d),
  fromCodes(0x201c),
  fromCodes(0x201d),
];

const ellipsisLikeText = [
  fromCodes(0x00c3, 0x00a2, 0x00e2, 0x201a, 0x00ac, 0x00c2, 0x00a6),
  fromCodes(0x00e2, 0x20ac, 0x00a6),
  fromCodes(0x2026),
];

const nonBreakingSpaceLikeText = [
  fromCodes(0x00c3, 0x201a, 0x00c2, 0x0020),
  fromCodes(0x00c2, 0x0020),
];

function replaceAny(value: string, candidates: string[], replacement: string) {
  return candidates.reduce((next, candidate) => next.split(candidate).join(replacement), value);
}

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

  return replaceAny(
    replaceAny(
      replaceAny(
        replaceAny(
          replaceAny(value, dashLikeText, " - "),
          apostropheLikeText,
          "'"
        ),
        quoteLikeText,
        '"'
      ),
      ellipsisLikeText,
      "..."
    ),
    nonBreakingSpaceLikeText,
    " "
  )
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
