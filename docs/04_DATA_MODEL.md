# FinanceOS Technical Documentation

## 5. Data Model

### Transaction
```typescript
interface Transaction {
  id: string;                    // uid() — random alphanumeric
  type: TransactionType;         // see Transaction Type System
  amount: number;                // always positive, toFixed2()
  description: string;           // user note / vendor name
  sourceId: string;              // account.id or creditCard.id
  destinationId?: string;        // transfers only — target account/card id
  createdAt: string;             // ISO UTC — when user recorded it
  date?: string;                 // YYYY-MM-DD — accounting date (can be backdated)
  categoryId?: string;           // category.id — optional for transfers
  tag?: "Personal" | "Business"; // for tax separation
  mode?: TransactionMode;        // Cash | Debit | Credit Card | Bank Transfer | E-Transfer
  linkedVehicleId?: string;      // vehicle.id — for vehicle expense tracking
  linkedPropertyId?: string;     // houseLoan.id — for property expense tracking
  odometer?: string;             // km reading — vehicle expenses only
}
```

### Account (Bank)
```typescript
interface Account {
  id: string;
  name: string;
  type: "bank" | "cash" | "business";
  currency: string;              // "CAD"
  openingBalance: number;        // COMPUTED — never set directly
  active: boolean;
  createdAt: string;
  primary?: boolean;             // shows first in dropdowns with ★
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
  openingBalance: number;        // COMPUTED — amount currently owed
  linkedAccountId?: string;      // default bank account for payments
  active: boolean;
  createdAt: string;
  primary?: boolean;             // shows first in dropdowns with ★
}
```

### Category
```typescript
interface Category {
  id: string;
  name: string;
  type: "income" | "expense" | "both";
  color?: string;
  vehicleLinked?: boolean;       // shows vehicle/odometer fields in TransactionForm
  propertyLinked?: boolean;      // shows property selector in TransactionForm
  archived?: boolean;            // hidden from dropdowns, transactions stay linked
}
```

### FixedPayment
```typescript
interface FixedPayment {
  id: string;
  name: string;
  amount: number;
  schedule: PaymentSchedule;     // Weekly | Bi-weekly | Semi-monthly | Monthly | Annual | One-time
  date: string;                  // YYYY-MM-DD — anchor date, auto-advances after each payment
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
  source: string;                // account id
  leaseStart: string;
  leaseEnd: string;
  nextPaymentDate: string;       // auto-advances after each confirmed payment
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
  source: string;                // account id
  startDate: string;
  endDate: string;
  nextPaymentDate: string;       // auto-advances after each confirmed payment
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
Stored as a single JSON object in `finance_os_business`. Contains:
- `clientName`, `businessName`, `hstNumber`
- `invoices[]` — contractor invoice records
- `contracts[]` — client contracts with hourly rates
- `hoursAllocations[]` — hours per fiscal year per contract
- `hstRemittances[]` — HST quarterly payments
- `corpInstalments[]` — corporate tax instalment payments
- `payrollRemittances[]` — payroll remittance records
- `arrearsHST`, `arrearsCorp` — outstanding CRA arrears
- `rateSettings` — historical rate entries (HST rate, quick method rate, corp instalment, payroll draw)
- `taxObligations[]` — all CRA obligations with paid/unpaid status

---

