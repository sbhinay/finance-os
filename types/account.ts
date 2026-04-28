export type AccountType = "bank" | "cash" | "business";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: number;
  balanceBase?: number;
  reconciledBalance?: number;
  reconciledDate?: string;
  active: boolean;
  createdAt: string;
  primary?: boolean;
}
