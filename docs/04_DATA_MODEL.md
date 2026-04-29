# FinanceOS Technical Documentation

## 5. Data Model

### Transaction
The transaction domain is the master ledger. Every money movement, adjustment, and audit row is stored here.

```typescript
interface Transaction {
  id: string;
  type: TransactionType;
  subType?: TransactionSubType;
  amount: number;
  interestAmount?: number;
  principalAmount?: number;
  date: string;
  createdAt: string;
  description: string;
  notes?: string;
  sourceId: string;
  destinationId?: string;
  categoryId?: string;
  tag?: "Personal" | "Business";
  taxYear?: number;
  mode?: TransactionMode;
  currency: string;
  status: TransactionStatus;
  linkedVehicleId?: string;
  linkedPropertyId?: string;
  linkedLiabilityId?: string;
  odometer?: string;
}
```

#### Important Notes
- `amount` is always stored positive; direction is determined by `type`.
- `sourceId` and `destinationId` are references to `Account.id` or `CreditCard.id`.
- `date` is the accounting date used for reports and replay.
- `createdAt` is the system-assigned timestamp when the row was created.
- `linkedVehicleId` and `linkedPropertyId` connect expenses to assets.

### Transaction Types
Supported transaction types:
- `expense`
- `income`
- `transfer`
- `credit_card_payment`
- `refund`
- `dividend`
- `tax_payment`
- `loan_receipt`
- `loan_payment`
- `withdrawal`
- `adjustment`

#### Reconciliation and Audit
- Reconciliation audit rows are stored as `type: "adjustment"` with `subType: "reconciliation"`.
- These rows are kept for auditability but should be excluded from normal expense/income reporting.

### Account
```typescript
interface Account {
  id: string;
  name: string;
  type: "bank" | "cash" | "business";
  currency: string;
  openingBalance: number;
  balanceBase?: number;
  reconciledBalance?: number;
  reconciledDate?: string;
  active: boolean;
  createdAt: string;
  primary?: boolean;
}
```

### CreditCard
```typescript
interface CreditCard {
  id: string;
  name: string;
  issuer: string;
  type: "personal" | "business";
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
  date: string;
  endDate?: string;
  source: string;
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
  source: string;
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
  source: string;
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

### Business
- Stored as a single `Business` object in `finance_os_business`.
- Contains invoices, contracts, HST remittances, corporate instalments, payroll remittances, arrears, and rate settings.
