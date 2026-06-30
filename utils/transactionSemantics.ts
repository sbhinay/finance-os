import type {
  Transaction,
  TransactionPurpose,
  TransactionSubType,
  TransactionType,
} from "@/types/transaction";
import { toFixed2 } from "@/utils/finance";

export type LedgerEntityKind = "account" | "card";

const PURPOSE_BY_TYPE_AND_SUBTYPE: Partial<
  Record<TransactionType, Partial<Record<TransactionSubType, TransactionPurpose>>>
> = {
  transfer: {
    bank_to_bank: "bank_transfer",
    e_transfer: "e_transfer",
    cc_payment: "credit_card_payment",
    loc_payment: "loc_payment",
    loc_draw: "loc_draw",
    tfsa_contribution: "tfsa_contribution",
    rrsp_contribution: "rrsp_contribution",
  },
  loan_receipt: {
    personal_loan: "personal_loan_receipt",
    bank_loan: "bank_loan_receipt",
    shareholder_loan: "shareholder_loan_receipt",
  },
  loan_payment: {
    personal_loan: "personal_loan_payment",
    bank_loan: "bank_loan_payment",
    mortgage: "mortgage_payment",
    shareholder_loan: "shareholder_loan_payment",
    line_of_credit: "loc_payment",
  },
  tax_payment: {
    hst_remittance: "hst_remittance",
    corp_tax: "corporate_tax_payment",
    payroll_remittance: "payroll_remittance",
    personal_income_tax: "personal_income_tax",
    other_cra: "other_tax_payment",
  },
};

const DEFAULT_PURPOSE_BY_TYPE: Partial<Record<TransactionType, TransactionPurpose>> = {
  expense: "general_expense",
  income: "general_income",
  refund: "purchase_refund",
  dividend: "dividend",
  withdrawal: "withdrawal",
  adjustment: "adjustment",
};

export function inferTransactionPurpose(
  transaction: Pick<Transaction, "type" | "subType" | "purpose">
    & Partial<Pick<Transaction, "description" | "linkedVehicleId">>
): TransactionPurpose | undefined {
  if (transaction.purpose) return transaction.purpose;
  const description = transaction.description?.trim() ?? "";
  if (
    transaction.linkedVehicleId
    && transaction.type === "expense"
    && /^vehicle lease payment\b/i.test(description)
  ) {
    return "vehicle_lease_payment";
  }
  if (
    (transaction.type === "loan_payment" || transaction.type === "expense")
    && /\bmortgage payment\b/i.test(description)
  ) {
    return "mortgage_payment";
  }
  if (transaction.type === "expense" && /^LOC Interest\b/i.test(description)) {
    return "loan_interest";
  }
  if (transaction.subType) {
    const inferred = PURPOSE_BY_TYPE_AND_SUBTYPE[transaction.type]?.[transaction.subType];
    if (inferred) return inferred;
  }
  return DEFAULT_PURPOSE_BY_TYPE[transaction.type];
}

export function getTransactionEffect(
  transaction: Transaction,
  entityId: string,
  kind: LedgerEntityKind
): number {
  const isSource = transaction.sourceId === entityId;
  const isDestination = transaction.destinationId === entityId;
  if (!isSource && !isDestination) return 0;

  switch (transaction.type) {
    case "expense":
    case "tax_payment":
    case "loan_payment":
    case "withdrawal":
      return isSource
        ? toFixed2(kind === "card" ? transaction.amount : -transaction.amount)
        : 0;

    case "income":
    case "refund":
    case "dividend":
    case "loan_receipt":
      return isSource
        ? toFixed2(kind === "card" ? -transaction.amount : transaction.amount)
        : 0;

    case "transfer":
      if (isSource) {
        return toFixed2(
          kind === "card" && transaction.subType === "loc_draw"
            ? transaction.amount
            : -transaction.amount
        );
      }
      return isDestination
        ? toFixed2(kind === "card" ? -transaction.amount : transaction.amount)
        : 0;

    case "adjustment":
      if (isSource) return toFixed2(transaction.amount);
      return isDestination ? toFixed2(-transaction.amount) : 0;
  }
}

export function getTransactionListEffect(transaction: Transaction): number | null {
  switch (transaction.type) {
    case "income":
    case "refund":
    case "dividend":
    case "loan_receipt":
      return toFixed2(transaction.amount);
    case "transfer":
      return null;
    default:
      return toFixed2(-transaction.amount);
  }
}

export function getExpenseReportEffect(transaction: Transaction): number {
  if (transaction.type === "expense") return toFixed2(transaction.amount);
  if (transaction.type === "refund") return toFixed2(-transaction.amount);
  return 0;
}

export function transactionFingerprint(transaction: Transaction): string {
  return [
    inferTransactionPurpose(transaction) ?? `${transaction.type}:${transaction.subType ?? ""}`,
    transaction.date,
    toFixed2(transaction.amount).toFixed(2),
    transaction.sourceId,
    transaction.destinationId ?? "",
    transaction.linkedVehicleId ?? "",
    transaction.linkedPropertyId ?? "",
    transaction.linkedLiabilityId ?? "",
    transaction.linkedInvoiceId ?? "",
  ].join("|");
}

export function isSemanticDuplicate(
  candidate: Transaction,
  existing: Transaction
): boolean {
  if (
    candidate.id === existing.id
    || candidate.status === "pending"
    || existing.status === "pending"
  ) {
    return false;
  }
  if (transactionFingerprint(candidate) === transactionFingerprint(existing)) {
    return true;
  }

  const candidatePurpose = inferTransactionPurpose(candidate);
  const existingPurpose = inferTransactionPurpose(existing);
  const purposesCompatible = candidatePurpose === existingPurpose
    || (
      [candidatePurpose, existingPurpose].includes("general_expense")
      && [candidatePurpose, existingPurpose].includes("recurring_expense")
    );
  const sameCoreIdentity = purposesCompatible
    && candidate.date === existing.date
    && toFixed2(candidate.amount) === toFixed2(existing.amount)
    && candidate.sourceId === existing.sourceId
    && (candidate.destinationId ?? "") === (existing.destinationId ?? "");
  const compatibleLink = (a?: string, b?: string) => !a || !b || a === b;

  return sameCoreIdentity
    && compatibleLink(candidate.linkedVehicleId, existing.linkedVehicleId)
    && compatibleLink(candidate.linkedPropertyId, existing.linkedPropertyId)
    && compatibleLink(candidate.linkedLiabilityId, existing.linkedLiabilityId)
    && compatibleLink(candidate.linkedInvoiceId, existing.linkedInvoiceId);
}
