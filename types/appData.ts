import { Account } from "./account";
import { CreditCard } from "./creditCard";
import { Transaction } from "./transaction";
import { Category } from "./category";
import { Business } from "./business";
import {
  Vehicle,
  HouseLoan,
  PropertyTax,
  FixedPayment,
  IncomeSource,
  InvestmentAccount,
  PendingTransaction,
} from "./domain";

export interface AppMeta {
  version: number;
  lastSaved: string | null;
  exportedAt: string | null;
  appVersion: string;
}

export interface AppProfile {
  name: string;
  email: string;
}

/** Root data shape — mirrors FinanceOS localStorage JSON */
export interface AppData {
  meta: AppMeta;
  profile: AppProfile;
  bankAccounts: Account[];
  creditCards: CreditCard[];
  transactions: Transaction[];
  pendingTransactions: PendingTransaction[];
  dismissedPendingKeys: string[];
  categories: Category[];
  vehicles: Vehicle[];
  houseLoans: HouseLoan[];
  propertyTaxes: PropertyTax[];
  futurePayments: FixedPayment[];
  incomes: IncomeSource[];
  rrsp: InvestmentAccount;
  tfsa: InvestmentAccount;
  business: Business;
}
