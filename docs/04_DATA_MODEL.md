# FinanceOS Technical Documentation

## 5. Data Model

### Transaction
```typescript
type TransactionType =
  | "expense"
  | "income"
  | "transfer"
  | "credit_card_payment"
  | "refund"
  | "dividend"
  | "tax_payment"
  | "loan_receipt"
  | "loan_payment"
  | "withdrawal"
  | "adjustment";

type TransactionSubType =
  | "hst_remittance"
  | "corp_tax"
  | "payroll_remittance"
  | "personal_income_tax"
  | "other_cra"
  | "personal_loan"
  | "bank_loan"
  | "line_of_credit"
  | "mortgage"
  | "shareholder_loan"
  | "reconciliation"
  | "correction"
  | "write_off"
  | "opening_balance"
  | "cc_payment"
  | "tfsa_contribution"
  | "rrsp_contribution"
  | "bank_to_bank"
  | "e_transfer";

interface Transaction {
  id: string;
  type: TransactionType;
  subType?: TransactionSubType;
  amount: number;
  interestAmount?: number;
  principalAmount?: number;
  date: string;                  // YYYY-MM-DD accounting date
  createdAt: string;             // ISO UTC when the row was recorded
  description: string;
  notes?: string;
  sourceId: string;              // account.id or creditCard.id
  destinationId?: string;        // required for transfer, adjustment, credit_card_payment
  categoryId?: string;
  tag?: "Personal" | "Business";
  taxYear?: number;
  mode?: TransactionMode;
  currency: string;              // "CAD"
  status: "pending" | "cleared" | "reconciled";
  linkedVehicleId?: string;
  linkedPropertyId?: string;
  linkedLiabilityId?: string;
  odometer?: string;
}
```

Notes:
- `credit_card_payment` is now a first-class transaction type. It is not modeled as a plain expense or a generic transfer in the UI.
- Reconciliation audit rows are stored as `type: "adjustment"` with `subType: "reconciliation"`.
- `date` drives filtering, reporting, and balance replay. `createdAt` preserves when the record was actually entered.

### Account (Bank)
```typescript
interface Account {
  id: string;
  name: string;
  type: "bank" | "cash" | "business";
  currency: string;              // "CAD"
  openingBalance: number;        // current computed balance shown in UI
  balanceBase?: number;          // stable replay baseline when no reconcile row exists
  reconciledBalance?: number;    // latest user-confirmed balance
  reconciledDate?: string;       // YYYY-MM-DD baseline date
  active: boolean;
  createdAt: string;
  primary?: boolean;
}
```

Notes:
- `openingBalance` is persisted, but treated as the current computed balance, not as a permanent historical baseline.
- `balanceBase` and `reconciledBalance` are used by replay to avoid compounding old computed values.

### CreditCard
```typescript
interface CreditCard {
  id: string;
  name: string;
  issuer: string;
  type: "personal" | "business";
  limitAmount: number;
  openingBalance: number;        // current amount owed
  balanceBase?: number;          // stable replay baseline
  reconciledBalance?: number;    // latest statement-confirmed balance
  reconciledDate?: string;       // YYYY-MM-DD baseline date
  linkedAccountId?: string;      // default account for payments
  active: boolean;
  createdAt: string;
  primary?: boolean;
}
```

### Category
```typescript
interface Category {
  id: string;
  name: string;
  type: "income" | "expense" | "both";
  color?: string;
  vehicleLinked?: boolean;
  propertyLinked?: boolean;
  archived?: boolean;
}
```

### FixedPayment
```typescript
interface FixedPayment {
  id: string;
  name: string;
  amount: number;
  schedule: PaymentSchedule;
  date: string;                  // anchor date
  endDate?: string;
  source: string;                // account.id or creditCard.id
  categoryId?: string;
  mode?: string;
  tag?: string;
}
```

### Vehicle
```typescript
interface Vehicle {
  id: string;
  name: string;
  year: string;
  make: string;
  model: string;
  vtype: "Lease" | "Finance";
  payment: number;
  schedule: PaymentSchedule;
  source: string;                // canonical value should be account.id
  leaseStart: string;
  leaseEnd: string;
  nextPaymentDate: string;
  mileageAllowance: number;
  excessRate: number;
  residual: number;
  endOfLeaseOption: "Return" | "Buy Out" | "Extend" | "Undecided";
  principal: number;
  remaining: number;
  interestRate: number;
  status: string;
}
```

### HouseLoan
```typescript
interface HouseLoan {
  id: string;
  name: string;
  address?: string;
  principal: number;
  remaining: number;
  payment: number;
  schedule: PaymentSchedule;
  source: string;                // canonical value should be account.id
  startDate: string;
  endDate: string;
  nextPaymentDate: string;
  interestRate: number;
}
```

### PropertyTax
```typescript
interface PropertyTax {
  id: string;
  name: string;
  accountNumber: string;
  payments: PropertyTaxPayment[];
}

interface PropertyTaxPayment {
  id: string;
  propertyId: string;
  amount: number;
  date: string;
  paid: boolean;
  paidDate?: string;
  note?: string;
}
```

### Business (CRA Domain)
Stored as one JSON object in `finance_os_business`. The hook normalizes missing arrays and nested defaults on load.

Key domains:
- `clientName`, `businessName`, `hstNumber`
- `contracts[]`
- `invoices[]`
- `hstRemittances[]`
- `corporateInstalments[]`
- `payrollRemittances[]`
- `arrearsPayments[]`
- `arrearsHST`, `arrearsCorp`
- `rateSettings`

### Current Architectural Notes
- Transactions remain the master ledger for activity.
- Accounts and cards now also carry replay baseline metadata so reconciliation can stabilize balances.
- Import/export must preserve `balanceBase`, `reconciledBalance`, and `reconciledDate` for accounts and credit cards.

---
