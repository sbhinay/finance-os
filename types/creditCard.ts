export type CardType = "personal" | "business" | "loc";
export type DebtRepaymentStrategy = "minimum" | "statement_balance" | "full_current_balance" | "fixed_amount";

export interface CreditCard {
  id: string;
  name: string;
  issuer: string;
  type: CardType;
  limitAmount: number;
  openingBalance: number;
  balanceSnapshotAmount?: number;
  balanceSnapshotDate?: string;
  linkedAccountId?: string;
  annualFeeAmount?: number;
  annualFeeDate?: string;
  repaymentProjectionEnabled?: boolean;
  repaymentStrategy?: DebtRepaymentStrategy;
  repaymentDueDate?: string;
  repaymentFixedAmount?: number;
  repaymentMinimumAmount?: number;
  repaymentMinimumPercent?: number;
  repaymentInterestRate?: number;
  active: boolean;
  createdAt: string;
  primary?: boolean;
}
