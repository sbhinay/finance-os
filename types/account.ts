export type AccountType = "bank" | "cash" | "business";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  bank?: string;
  accountNumber?: string;
  currency: string;
  openingBalance: number;
  balanceBase?: number;
  reconciledBalance?: number;
  reconciledDate?: string;
  reconciledAt?: string;
  monthlyFeeAmount?: number;
  monthlyFeeDate?: string;
  active: boolean;
  createdAt: string;
  primary?: boolean;
}
