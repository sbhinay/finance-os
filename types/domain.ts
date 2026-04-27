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
  interestRate: number;
  status: string;
}

// ─── House Loans ─────────────────────────────────────────────────────────────
export interface HouseLoan {
  id: string;
  name: string;
  address?: string;
  principal: number;
  remaining: number;
  payment: number;
  schedule: PaymentSchedule;
  source: string;
  startDate: string;
  endDate: string;
  nextPaymentDate: string;
  interestRate: number;
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

export interface FixedPayment {
  id: string;
  name: string;
  amount: number;
  schedule: PaymentSchedule;
  date: string;             // anchor date for schedule rolling
  endDate?: string;
  source: string;           // account or card id
  categoryId?: string;
  mode?: string;
  tag?: string;
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
  mode: string;
  tag: "Personal" | "Business";
  linkedVehicleId?: string;
  createdAt: string;
}
