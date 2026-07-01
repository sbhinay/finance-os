// ─── Vehicles ────────────────────────────────────────────────────────────────
export type VehicleType = "Lease" | "Finance";
export type EndOfLeaseOption = "Return" | "Buy Out" | "Extend" | "Undecided";

export interface Vehicle {
  id: string;
  name: string;
  year: string;
  make: string;
  model: string;
  vtype: VehicleType;
  payment: number;
  schedule: PaymentSchedule;
  source: string;           // account name
  leaseStart: string;
  leaseEnd: string;
  nextPaymentDate: string;
  mileageAllowance: number;
  excessRate: number;
  residual: number;
  endOfLeaseOption: EndOfLeaseOption;
  principal: number;
  remaining: number;
  balanceSnapshotAmount?: number;
  balanceSnapshotDate?: string;
  interestRate: number;
  insuranceAmount?: number;
  insuranceSchedule?: PaymentSchedule;
  insuranceDate?: string;
  insuranceSource?: string;
  status: string;
}

// ─── House Loans ─────────────────────────────────────────────────────────────
export interface HouseLoan {
  id: string;
  name: string;
  address?: string;
  principal: number;
  remaining: number;
  balanceSnapshotAmount?: number;
  balanceSnapshotDate?: string;
  payment: number;
  schedule: PaymentSchedule;
  source: string;
  startDate: string;
  endDate: string;
  nextPaymentDate: string;
  interestRate: number;
  propertyTaxAmount?: number;
  propertyTaxSchedule?: PaymentSchedule;
  propertyTaxDate?: string;
  propertyTaxSource?: string;
  propertyTaxRollNumber?: string;
}

export interface Liability {
  id: string;
  name: string;
  type: "Personal Loan" | "Bank Loan" | "Shareholder Loan";
  openingBalance: number;
  balanceSnapshotAmount?: number;
  balanceSnapshotDate?: string;
  tag: "Personal" | "Business";
  notes?: string;
  archived?: boolean;
}

// ─── Property Tax ────────────────────────────────────────────────────────────
export interface PropertyTaxPayment {
  id: string;
  propertyId: string;
  amount: number;
  date: string;
  paid: boolean;
  paidDate?: string;
  note?: string;
}

export interface PropertyTax {
  id: string;
  name: string;
  accountNumber: string;
  payments: PropertyTaxPayment[];
}

// ─── Fixed Payments ──────────────────────────────────────────────────────────
export type PaymentSchedule =
  | "Weekly"
  | "Bi-weekly"
  | "Semi-monthly"
  | "Monthly"
  | "Annual"
  | "One-time";

export type RecurringKind =
  | "general"
  | "subscription"
  | "utility"
  | "insurance"
  | "property_tax"
  | "planned_payment"
  | "account_fee"
  | "card_fee";

export type PlannedPaymentTransactionType = Extract<TransactionType, "expense" | "transfer">;

export interface FixedPayment {
  id: string;
  name: string;
  kind?: RecurringKind;
  ownerType?: "account" | "card" | "vehicle" | "house_loan";
  ownerId?: string;
  amount: number;
  schedule: PaymentSchedule;
  startDate?: string;       // first known occurrence; stable backfill anchor
  date: string;             // next due date; advances after confirmation/logging
  endDate?: string;
  source: string;           // account or card id
  destinationId?: string;
  transactionType?: PlannedPaymentTransactionType;
  subType?: TransactionSubType;
  categoryId?: string;
  mode?: string;
  tag?: string;
  purpose?: TransactionPurpose;
  archived?: boolean;
}

export function getFixedPaymentKind(fp?: Pick<FixedPayment, "kind"> | null): RecurringKind {
  return fp?.kind ?? "general";
}

// ─── Income Sources ───────────────────────────────────────────────────────────
export interface IncomeSource {
  id: string;
  source: string;
  amount: number;
  type: "Employment" | "Self-employment" | "Investment" | "Tax Refund" | "Rental" | "Other";
  schedule: PaymentSchedule;
  date: string;
  depositTo: string;
}

// ─── RRSP / TFSA ─────────────────────────────────────────────────────────────
export interface InvestmentContribution {
  id: string;
  amount: number;
  schedule: PaymentSchedule;
  date: string;
  source: string;
}

export interface InvestmentAccount {
  contributionLimit: number;
  existingContribution: number;
  currentValue: number;
  contributions: InvestmentContribution[];
}

// ─── Pending Transactions ────────────────────────────────────────────────────
export type PendingSourceType =
  | "fixed"
  | "vehicle"
  | "loan"
  | "cra_payroll"
  | "cra_corp"
  | "cra_hst"
  | "propertytax";

export interface PendingTransaction {
  id: string;
  key: string;              // dedup key — e.g. "fp_{id}_{date}"
  sourceType: PendingSourceType;
  sourceId: string;
  name: string;
  amount: number;
  dueDate: string;
  account: string;
  category: string;
  type: "Expense" | "Income";
  transactionType?: PlannedPaymentTransactionType;
  subType?: TransactionSubType;
  destinationId?: string;
  mode: string;
  tag: "Personal" | "Business";
  linkedVehicleId?: string;
  linkedPropertyId?: string;
  recurringOriginType?: RecurringOriginType;
  recurringOriginId?: string;
  purpose?: TransactionPurpose;
  createdAt: string;
}
import type { RecurringOriginType, TransactionPurpose, TransactionSubType, TransactionType } from "@/types/transaction";
