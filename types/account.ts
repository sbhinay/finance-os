export type AccountType = "bank" | "cash" | "business";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  bank?: string;
  accountNumber?: string;
  currency: string;
  openingBalance: number;
  balanceSnapshotAmount?: number;
  balanceSnapshotDate?: string;
  monthlyFeeAmount?: number;
  monthlyFeeDate?: string;
  active: boolean;
  createdAt: string;
  primary?: boolean;
}
