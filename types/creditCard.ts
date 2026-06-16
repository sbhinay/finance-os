export type CardType = "personal" | "business" | "loc";

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
  active: boolean;
  createdAt: string;
  primary?: boolean;
}
