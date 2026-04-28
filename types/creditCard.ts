export type CardType = "personal" | "business";

export interface CreditCard {
  id: string;
  name: string;
  issuer: string;
  type: CardType;
  limitAmount: number;
  openingBalance: number;
  balanceBase?: number;
  reconciledBalance?: number;
  reconciledDate?: string;
  linkedAccountId?: string;
  active: boolean;
  createdAt: string;
  primary?: boolean;
}
