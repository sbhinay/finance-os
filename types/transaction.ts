// ─── Transaction Types ────────────────────────────────────────────────────────

export type TransactionType =
  | "expense"          // money spent — general
  | "income"           // money earned — general
  | "transfer"         // between own accounts — neutral, no net worth change
  | "refund"           // reversal of prior expense — not income
  | "dividend"         // corporate dividend to self — specific T1 treatment
  | "tax_payment"      // CRA remittance — not a general expense
  | "loan_receipt"     // borrowed money arriving — not income, creates liability
  | "loan_payment"     // debt repayment — principal + interest split
  | "withdrawal"       // personal draw from corporation — not corporate expense
  | "adjustment";      // reconciliation correction — no real money movement

export type TransactionSubType =
  // tax_payment sub-types
  | "hst_remittance"
  | "corp_tax"
  | "payroll_remittance"
  | "personal_income_tax"
  | "other_cra"
  // loan sub-types
  | "personal_loan"
  | "bank_loan"
  | "line_of_credit"
  | "mortgage"
  | "shareholder_loan"
  // adjustment sub-types
  | "reconciliation"
  | "correction"
  | "write_off"
  | "opening_balance"
  // transfer sub-types
  | "cc_payment"
  | "tfsa_contribution"
  | "rrsp_contribution"
  | "bank_to_bank"
  | "e_transfer";

export type TransactionMode =
  | "Cash"
  | "Debit"
  | "Credit Card"
  | "Bank Transfer"
  | "E-Transfer"
  | "Cheque"
  | "Direct Deposit"
  | "Pre-authorized";

export type TransactionStatus =
  | "pending"      // logged but not yet cleared at bank
  | "cleared"      // confirmed on bank statement
  | "reconciled";  // matched against bank statement during reconciliation

// ─── Balance Effect Reference ─────────────────────────────────────────────────
//
// expense        → source balance decreases
// income         → source balance increases
// transfer       → source decreases, destination increases (CC destination = balance decreases/owed reduces)
// refund         → source balance increases (reverses expense)
// dividend       → source balance increases (same as income but different tax treatment)
// tax_payment    → source balance decreases (same as expense but excluded from expense reports)
// loan_receipt   → source balance increases (same as income but NOT taxable — linked to liability)
// loan_payment   → source balance decreases (principal reduces liability, interest is expense)
// withdrawal     → source balance decreases (personal draw — not corporate expense)
// adjustment     → source adjusted by amount, destination gets offsetting entry

export interface Transaction {
  // ── Identity ──────────────────────────────────────────────────────────────
  id: string;

  // ── Classification ────────────────────────────────────────────────────────
  type: TransactionType;
  subType?: TransactionSubType;    // required for tax_payment, loan, adjustment, transfer

  // ── Amount ────────────────────────────────────────────────────────────────
  amount: number;                  // always positive — type determines direction
  interestAmount?: number;         // loan_payment only — interest portion (tax deductible if business)
  principalAmount?: number;        // loan_payment only — principal portion (reduces liability)

  // ── Date & Time ───────────────────────────────────────────────────────────
  date: string;                    // YYYY-MM-DD — accounting date, user controlled, can be any date
  createdAt: string;               // ISO UTC e.g. "2026-04-20T18:00:00.000Z" — when logged, system assigned, never user controlled

  // ── Description ───────────────────────────────────────────────────────────
  description: string;             // payee / vendor name
  notes?: string;                  // user annotation — separate from description

  // ── Accounts ──────────────────────────────────────────────────────────────
  sourceId: string;                // account or card ID — where money comes FROM
  destinationId?: string;          // account or card ID — where money goes TO
                                   // required for: transfer, adjustment
                                   // optional for: loan_receipt (links to liability when built)

  // ── Classification ────────────────────────────────────────────────────────
  categoryId?: string;             // required for expense/income — exempt for transfer, tax_payment, adjustment
  tag?: "Personal" | "Business";   // for tax separation
  taxYear?: number;                // derived from date if not set — calendar year for personal, fiscal for corp

  // ── Payment ───────────────────────────────────────────────────────────────
  mode?: TransactionMode;
  currency: string;                // default "CAD"
  status: TransactionStatus;       // default "cleared"

  // ── Links ─────────────────────────────────────────────────────────────────
  linkedVehicleId?: string;        // vehicle expense tracking
  linkedPropertyId?: string;       // property expense tracking
  linkedLiabilityId?: string;      // loan_receipt, loan_payment — links to liability account (future)

  // ── Vehicle specific ──────────────────────────────────────────────────────
  odometer?: string;               // km reading at time of transaction
}

// ─── Helper — derive tax year from date ───────────────────────────────────────
export function deriveTaxYear(date: string, isCorporate = false): number {
  const d = new Date(date + "T12:00:00");
  if (isCorporate) {
    // Canadian corporate fiscal year — April to March
    return d.getMonth() >= 3 ? d.getFullYear() + 1 : d.getFullYear();
  }
  // Personal T1 — calendar year
  return d.getFullYear();
}

// ─── Helper — does this type affect balance? ──────────────────────────────────
export function affectsBalance(type: TransactionType, status: TransactionStatus): boolean {
  if (status === "pending") return false;   // pending never affects balance
  return true;                              // all cleared/reconciled transactions affect balance
}

// ─── Helper — is this type included in expense reports? ───────────────────────
export function isExpenseReportable(type: TransactionType): boolean {
  return type === "expense" || type === "refund";
}

// ─── Helper — is this type included in income reports? ────────────────────────
export function isIncomeReportable(type: TransactionType): boolean {
  return type === "income" || type === "dividend";
}

// ─── Helper — is this type tax relevant? ──────────────────────────────────────
export function isTaxRelevant(type: TransactionType): boolean {
  return ["expense", "income", "dividend", "tax_payment", "loan_payment", "withdrawal"].includes(type);
}

// ─── Helper — requires destinationId? ────────────────────────────────────────
export function requiresDestination(type: TransactionType): boolean {
  return type === "transfer" || type === "adjustment";
}

// ─── Helper — requires subType? ──────────────────────────────────────────────
export function requiresSubType(type: TransactionType): boolean {
  return ["tax_payment", "loan_receipt", "loan_payment", "transfer"].includes(type);
}

// ─── SubType options per type ─────────────────────────────────────────────────
export const SUB_TYPE_OPTIONS: Partial<Record<TransactionType, Array<{ value: TransactionSubType; label: string }>>> = {
  tax_payment: [
    { value: "hst_remittance",      label: "HST Remittance" },
    { value: "corp_tax",            label: "Corporate Tax" },
    { value: "payroll_remittance",  label: "Payroll Remittance" },
    { value: "personal_income_tax", label: "Personal Income Tax" },
    { value: "other_cra",           label: "Other CRA Payment" },
  ],
  loan_receipt: [
    { value: "personal_loan",    label: "Personal Loan" },
    { value: "bank_loan",        label: "Bank Loan" },
    { value: "line_of_credit",   label: "Line of Credit" },
    { value: "mortgage",         label: "Mortgage" },
    { value: "shareholder_loan", label: "Shareholder Loan" },
  ],
  loan_payment: [
    { value: "personal_loan",    label: "Personal Loan Payment" },
    { value: "bank_loan",        label: "Bank Loan Payment" },
    { value: "line_of_credit",   label: "Line of Credit Payment" },
    { value: "mortgage",         label: "Mortgage Payment" },
    { value: "shareholder_loan", label: "Shareholder Loan Payment" },
  ],
  transfer: [
    { value: "cc_payment",         label: "Credit Card Payment" },
    { value: "tfsa_contribution",  label: "TFSA Contribution" },
    { value: "rrsp_contribution",  label: "RRSP Contribution" },
    { value: "bank_to_bank",       label: "Bank to Bank" },
    { value: "e_transfer",         label: "E-Transfer" },
  ],
  adjustment: [
    { value: "reconciliation",  label: "Reconciliation" },
    { value: "correction",      label: "Correction" },
    { value: "write_off",       label: "Write Off" },
    { value: "opening_balance", label: "Opening Balance" },
  ],
};

// ─── Type display labels ──────────────────────────────────────────────────────
export const TYPE_LABELS: Record<TransactionType, string> = {
  expense:      "Expense",
  income:       "Income",
  transfer:     "Transfer",
  refund:       "Refund",
  dividend:     "Dividend",
  tax_payment:  "Tax Payment",
  loan_receipt: "Loan Receipt",
  loan_payment: "Loan Payment",
  withdrawal:   "Withdrawal",
  adjustment:   "Adjustment",
};

// ─── User facing types (shown in TransactionForm) ─────────────────────────────
export const USER_FACING_TYPES: TransactionType[] = [
  "expense",
  "income",
  "transfer",
  "refund",
  "dividend",
  "loan_receipt",
  "loan_payment",
  "withdrawal",
];

// ─── System assigned types (never shown in form dropdown) ─────────────────────
export const SYSTEM_TYPES: TransactionType[] = [
  "tax_payment",
  "adjustment",
];