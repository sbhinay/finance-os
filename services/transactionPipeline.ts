import { transactionRepository } from "@/repositories/transactionRepository";
import type {
  Transaction,
  TransactionMode,
  TransactionPurpose,
  TransactionStatus,
  TransactionSubType,
  TransactionType,
} from "@/types/transaction";
import { deriveTaxYear } from "@/types/transaction";
import { notifyDataChanged } from "@/utils/events";
import { toFixed2, uid } from "@/utils/finance";
import { syncBalances } from "@/utils/syncBalances";
import {
  inferTransactionPurpose,
  isSemanticDuplicate,
} from "@/utils/transactionSemantics";

type PurposeRule = {
  type: TransactionType;
  subType?: TransactionSubType;
  defaultMode?: TransactionMode;
};

const PURPOSE_RULES: Record<TransactionPurpose, PurposeRule> = {
  general_expense: { type: "expense" },
  general_income: { type: "income" },
  purchase_refund: { type: "refund" },
  dividend: { type: "dividend" },
  bank_transfer: { type: "transfer", subType: "bank_to_bank", defaultMode: "Bank Transfer" },
  e_transfer: { type: "transfer", subType: "e_transfer", defaultMode: "E-Transfer" },
  credit_card_payment: { type: "transfer", subType: "cc_payment", defaultMode: "Bank Transfer" },
  loc_payment: { type: "transfer", subType: "loc_payment", defaultMode: "Bank Transfer" },
  loc_draw: { type: "transfer", subType: "loc_draw", defaultMode: "Bank Transfer" },
  tfsa_contribution: { type: "transfer", subType: "tfsa_contribution", defaultMode: "Bank Transfer" },
  rrsp_contribution: { type: "transfer", subType: "rrsp_contribution", defaultMode: "Bank Transfer" },
  vehicle_lease_payment: { type: "expense", defaultMode: "Debit" },
  vehicle_finance_payment: { type: "loan_payment", subType: "bank_loan", defaultMode: "Debit" },
  mortgage_payment: { type: "loan_payment", subType: "mortgage", defaultMode: "Debit" },
  personal_loan_receipt: { type: "loan_receipt", subType: "personal_loan", defaultMode: "Bank Transfer" },
  personal_loan_payment: { type: "loan_payment", subType: "personal_loan", defaultMode: "Bank Transfer" },
  bank_loan_receipt: { type: "loan_receipt", subType: "bank_loan", defaultMode: "Bank Transfer" },
  bank_loan_payment: { type: "loan_payment", subType: "bank_loan", defaultMode: "Bank Transfer" },
  loan_interest: { type: "expense", defaultMode: "Bank Transfer" },
  shareholder_loan_receipt: { type: "loan_receipt", subType: "shareholder_loan", defaultMode: "Bank Transfer" },
  shareholder_loan_payment: { type: "loan_payment", subType: "shareholder_loan", defaultMode: "Bank Transfer" },
  hst_remittance: { type: "tax_payment", subType: "hst_remittance", defaultMode: "Bank Transfer" },
  corporate_tax_payment: { type: "tax_payment", subType: "corp_tax", defaultMode: "Bank Transfer" },
  payroll_remittance: { type: "tax_payment", subType: "payroll_remittance", defaultMode: "Bank Transfer" },
  personal_income_tax: { type: "tax_payment", subType: "personal_income_tax", defaultMode: "Bank Transfer" },
  other_tax_payment: { type: "tax_payment", subType: "other_cra", defaultMode: "Bank Transfer" },
  invoice_deposit: { type: "income", defaultMode: "Direct Deposit" },
  recurring_expense: { type: "expense" },
  withdrawal: { type: "withdrawal" },
  adjustment: { type: "adjustment" },
};

export interface CanonicalTransactionInput {
  id?: string;
  purpose: TransactionPurpose;
  amount: number;
  date: string;
  sourceId: string;
  destinationId?: string;
  categoryId?: string;
  description?: string;
  displayName?: string;
  linkedName?: string;
  destinationName?: string;
  notes?: string;
  tag?: "Personal" | "Business";
  mode?: TransactionMode;
  status?: TransactionStatus;
  currency?: string;
  createdAt?: string;
  linkedVehicleId?: string;
  linkedPropertyId?: string;
  linkedLiabilityId?: string;
  linkedInvoiceId?: string;
  principalAmount?: number;
  interestAmount?: number;
  odometer?: string;
}

function canonicalDescription(input: CanonicalTransactionInput): string {
  if (input.description?.trim()) return input.description.trim();
  if (input.displayName?.trim()) return input.displayName.trim();

  const linked = input.linkedName?.trim();
  const destination = input.destinationName?.trim();
  switch (input.purpose) {
    case "vehicle_lease_payment":
      return linked ? `Vehicle Lease Payment - ${linked}` : "Vehicle Lease Payment";
    case "vehicle_finance_payment":
      return linked ? `Vehicle Finance Payment - ${linked}` : "Vehicle Finance Payment";
    case "mortgage_payment":
      return linked ? `Mortgage Payment - ${linked}` : "Mortgage Payment";
    case "credit_card_payment":
      return destination ? `Credit Card Payment - ${destination}` : "Credit Card Payment";
    case "loc_payment":
      return destination ? `LOC Payment - ${destination}` : "LOC Payment";
    case "loc_draw":
      return destination ? `LOC Draw - ${destination}` : "LOC Draw";
    case "personal_loan_receipt":
      return linked ? `Personal Loan Receipt - ${linked}` : "Personal Loan Receipt";
    case "personal_loan_payment":
      return linked ? `Personal Loan Payment - ${linked}` : "Personal Loan Payment";
    case "bank_loan_receipt":
      return linked ? `Bank Loan Receipt - ${linked}` : "Bank Loan Receipt";
    case "bank_loan_payment":
      return linked ? `Bank Loan Payment - ${linked}` : "Bank Loan Payment";
    case "shareholder_loan_receipt":
      return linked ? `Shareholder Loan Receipt - ${linked}` : "Shareholder Loan Receipt";
    case "shareholder_loan_payment":
      return linked ? `Shareholder Loan Payment - ${linked}` : "Shareholder Loan Payment";
    case "hst_remittance":
      return "CRA Payment - HST";
    case "corporate_tax_payment":
      return "CRA Payment - Corporate Tax";
    case "payroll_remittance":
      return "CRA Payment - Payroll";
    case "personal_income_tax":
      return "CRA Payment - Personal Income Tax";
    case "invoice_deposit":
      return "Invoice Deposit";
    case "purchase_refund":
      return "Purchase Refund";
    case "bank_transfer":
      return destination ? `Transfer - ${destination}` : "Bank Transfer";
    default:
      return input.purpose.replaceAll("_", " ");
  }
}

export function buildCanonicalTransaction(
  input: CanonicalTransactionInput
): Transaction {
  const rule = PURPOSE_RULES[input.purpose];

  return {
    id: input.id ?? uid(),
    purpose: input.purpose,
    type: rule.type,
    subType: rule.subType,
    amount: toFixed2(input.amount),
    principalAmount: input.principalAmount == null ? undefined : toFixed2(input.principalAmount),
    interestAmount: input.interestAmount == null ? undefined : toFixed2(input.interestAmount),
    date: input.date.slice(0, 10),
    createdAt: input.createdAt ?? new Date().toISOString(),
    description: canonicalDescription(input),
    notes: input.notes?.trim() || undefined,
    sourceId: input.sourceId,
    destinationId: input.destinationId || undefined,
    categoryId: input.categoryId || undefined,
    tag: input.tag,
    taxYear: deriveTaxYear(input.date.slice(0, 10), input.tag === "Business"),
    mode: input.mode ?? rule.defaultMode,
    currency: input.currency ?? "CAD",
    status: input.status ?? "cleared",
    linkedVehicleId: input.linkedVehicleId || undefined,
    linkedPropertyId: input.linkedPropertyId || undefined,
    linkedLiabilityId: input.linkedLiabilityId || undefined,
    linkedInvoiceId: input.linkedInvoiceId || undefined,
    odometer: input.odometer || undefined,
  };
}

export function validateCanonicalTransaction(transaction: Transaction): string[] {
  const errors: string[] = [];
  if (!transaction.sourceId) errors.push("Source account is required.");
  if (!(transaction.amount > 0)) errors.push("Amount must be greater than zero.");
  if (!transaction.date) errors.push("Transaction date is required.");
  if (transaction.type === "transfer" && !transaction.destinationId) {
    errors.push("Destination account is required for a transfer.");
  }
  if (transaction.destinationId && transaction.destinationId === transaction.sourceId) {
    errors.push("Source and destination cannot be the same.");
  }
  if (
    transaction.type === "loan_payment"
    && (transaction.principalAmount != null || transaction.interestAmount != null)
    && toFixed2((transaction.principalAmount ?? 0) + (transaction.interestAmount ?? 0)) !== transaction.amount
  ) {
    errors.push("Principal and interest must equal the payment amount.");
  }
  return errors;
}

export function findSemanticDuplicate(
  transaction: Transaction,
  existing = transactionRepository.getAll()
): Transaction | undefined {
  return existing.find((candidate) => isSemanticDuplicate(transaction, candidate));
}

export function persistCanonicalTransaction(transaction: Transaction): Transaction {
  const prepared = {
    ...transaction,
    purpose: inferTransactionPurpose(transaction),
  };
  const errors = validateCanonicalTransaction(prepared);
  if (errors.length) throw new Error(errors.join(" "));

  const existing = transactionRepository.getAll();
  const index = existing.findIndex((candidate) => candidate.id === prepared.id);
  if (index >= 0) existing[index] = prepared;
  else existing.push(prepared);

  transactionRepository.saveAll(existing);
  syncBalances();
  notifyDataChanged("transactions");
  return prepared;
}

export function deleteCanonicalTransaction(id: string): void {
  transactionRepository.saveAll(
    transactionRepository.getAll().filter((transaction) => transaction.id !== id)
  );
  syncBalances();
  notifyDataChanged("transactions");
}
