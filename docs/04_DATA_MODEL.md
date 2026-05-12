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
- `interestAmount` and `principalAmount` are optional detail fields for debt payments; the total `amount` remains the cash amount that leaves the source account.

### Transaction Types
Supported transaction types:
- `expense`
- `income`
- `transfer`
- `refund`
- `dividend`
- `tax_payment`
- `loan_receipt`
- `loan_payment`
- `withdrawal`
- `adjustment`

#### Transfer Sub-types
- `cc_payment`
- `loc_draw`
- `bank_to_bank`
- `e_transfer`
- `tfsa_contribution`
- `rrsp_contribution`

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
  monthlyFeeAmount?: number;
  monthlyFeeDate?: string;
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
  annualFeeAmount?: number;
  annualFeeDate?: string;
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
  kind?: RecurringKind;
  ownerType?: "account" | "card" | "vehicle" | "house_loan";
  ownerId?: string;
  amount: number;
  schedule: PaymentSchedule;
  date: string;
  endDate?: string;
  source: string;
  destinationId?: string;
  transactionType?: "expense" | "transfer";
  subType?: TransactionSubType;
  categoryId?: string;
  mode?: string;
  tag?: string;
}

type RecurringKind =
  | "general"
  | "subscription"
  | "utility"
  | "insurance"
  | "property_tax"
  | "planned_payment"
  | "account_fee"
  | "card_fee";

#### Recurring Model Notes
- `FixedPayment` is still the shared recurring engine record underneath the app.
- Newer user-facing flows are moving recurring setup into stronger parent domains while still writing to this shared record shape.
- `ownerType` and `ownerId` identify recurring rows that are owned by a parent record rather than manually defined as standalone entries.
- `transactionType`, `subType`, and `destinationId` let recurring items declare how they should post without hardcoded page-specific assumptions.
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
  insuranceAmount?: number;
  insuranceSchedule?: PaymentSchedule;
  insuranceDate?: string;
  insuranceSource?: string;
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
  propertyTaxAmount?: number;
  propertyTaxSchedule?: PaymentSchedule;
  propertyTaxDate?: string;
  propertyTaxSource?: string;
  propertyTaxRollNumber?: string;
}
```

#### Regular vs Detailed Liability Inputs
- Regular mode only needs enough data to plan cash: payment amount, schedule, pay-from account, and next payment date.
- Detailed mode can add balance-sheet and financing fields like original principal, remaining balance, interest rate, term dates, and principal/interest split support.
- Missing detailed fields must not block normal cash projection or upcoming-obligation views.
- Property tax can now either remain in the legacy standalone `PropertyTax` domain or be owned directly by the house-loan/property parent during migration.

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
