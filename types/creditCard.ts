export type CardType = "personal" | "business";

export interface CreditCard {
  id: string;
  name: string;
  issuer: string;
  type: CardType;
  limitAmount: number;
  openingBalance: number;
  linkedAccountId?: string;
  active: boolean;
  createdAt: string;
  primary?: boolean;
}
