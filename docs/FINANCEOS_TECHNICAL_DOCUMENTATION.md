# FinanceOS — Technical Documentation
**Version:** 1.0  
**Last Updated:** April 2026  
**Status:** Active Development

---

## Table of Contents

1. [Vision & Purpose](#1-vision--purpose)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Architecture Overview](#4-architecture-overview)
5. [Data Model](#5-data-model)
6. [Storage Keys](#6-storage-keys)
7. [Transaction System](#7-transaction-system)
8. [Balance Architecture](#8-balance-architecture)
9. [Event System](#9-event-system)
10. [Repository Pattern](#10-repository-pattern)
11. [Module Map](#11-module-map)
12. [Navigation Structure](#12-navigation-structure)
13. [Business Rules](#13-business-rules)
14. [Import & Export](#14-import--export)
15. [Date & Time Standard](#15-date--time-standard)
16. [Deferred Items](#16-deferred-items)
17. [Cloud Migration Plan](#17-cloud-migration-plan)
18. [Commercial Product Vision](#18-commercial-product-vision)

---

## 1. Vision & Purpose

FinanceOS is a personal financial operating system built for **Canadian contractors, full-time employees, and incorporated business owners**. It tracks every transaction in and out of every account, projects short and mid-term financial position, and structures data to support personal (T1) and corporate (T2) tax filing guidance.

### Core Goals
- Log every penny in and out across all accounts, credit cards, and assets
- Project 30-day daily and monthly financial position
- Track CRA obligations (HST, corporate tax, payroll remittances)
- Structure data to pre-fill or guide Canadian tax return line items
- Support both personal and incorporated business financial tracking

### Target Users
- Independent contractors (T4A income, HST registrants)
- Incorporated business owners (T2 filers, payroll, dividends)
- Full-time employees with personal finance tracking needs

### Design Principle
One tool that grows with the user — starts as a personal tracker, evolves into a tax-ready financial record system.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Inline styles (no CSS framework — intentional for portability) |
| Storage (current) | Browser localStorage |
| Storage (future) | Supabase (PostgreSQL) |
| Auth (future) | Supabase Auth |
| Deployment (future) | Vercel |

### Project Configuration
- **Root:** No `src/` folder — files at project root level
- **Path alias:** `"@/*": ["./*"]` in `tsconfig.json`
- **No** external UI component libraries
- **No** state management libraries (React state + event bus only)

---

## 3. Project Structure

```
finance-os/
├── app/
│   └── page.tsx                          # Root layout + navigation + section routing
├── modules/
│   ├── accounts/
│   │   └── useAccounts.ts                # Bank account hook
│   ├── categories/
│   │   └── useCategories.ts              # Category hook with auto-seed
│   ├── creditCards/
│   │   └── useCreditCards.ts             # Credit card hook
│   ├── transactions/
│   │   └── useTransactions.ts            # Transaction hook
│   └── business/
│       ├── TransactionForm.tsx           # Universal transaction entry/edit modal
│       ├── DailyLogSection.tsx           # Daily log page
│       ├── CoreSections.tsx              # Bank accounts, CC, TX history, Overview
│       ├── DashboardProjectionSections.tsx
│       ├── FixedPaymentsSection.tsx
│       ├── HoursContractsSection.tsx
│       ├── TaxObligationsSection.tsx
│       ├── CorporationIncomeTaxRateSections.tsx
│       ├── AssetsSections.tsx            # Vehicles, House Loans, Property Tax
│       ├── CategoriesSection.tsx
│       ├── ImportExportSection.tsx
│       ├── useAssets.ts                  # Vehicle, loan, property tax hooks
│       ├── useBusiness.ts                # Business/CRA domain hook
│       └── useFixedPayments.ts           # Fixed payments + pending logic
├── repositories/
│   ├── accountRepository.ts
│   ├── creditCardRepository.ts
│   ├── transactionRepository.ts
│   ├── categoryRepository.ts
│   ├── businessRepository.ts
│   ├── fixedPaymentRepository.ts
│   └── assetRepositories.ts             # vehicle, houseLoan, propertyTax repos
├── rules/
│   ├── validationRules.ts
│   └── categoryRules.ts                 # Auto-detect + learned rules
├── types/
│   ├── transaction.ts
│   ├── account.ts
│   ├── creditCard.ts
│   ├── category.ts
│   ├── domain.ts                        # All other domain types
│   ├── business.ts
│   └── appData.ts
└── utils/
    ├── finance.ts                        # toFixed2, fmtCAD, fmtDate, schedules
    ├── recalculateBalances.ts            # Balance replay engine
    ├── syncBalances.ts                   # Wrapper — calls recalculate + saves
    ├── events.ts                         # Event bus
    ├── defaultCategories.ts             # 24 seed categories
    └── migrationService.ts              # Prototype JSON import (to be removed)
```

---

## 4. Architecture Overview

### Core Principle: Single Source of Truth

```
User action (add/edit/delete transaction)
        ↓
Write to finance_os_tx (transactionRepository)
        ↓
syncBalances() called
        ↓
recalculateBalances() replays ALL transactions from zero
        ↓
accountRepository.saveAll() + creditCardRepository.saveAll()
        ↓
notifyDataChanged() fires DATA_CHANGED_EVENT
        ↓
All hooks reload via event listener
        ↓
UI re-renders with correct data
```

**Critical rule:** `openingBalance` on accounts and cards is NEVER written directly by any component or hook. It is ONLY updated through `syncBalances()` → `recalculateBalances()`. Any code that directly mutates `openingBalance` outside this path is a bug.

### Repository Pattern (localStorage → Supabase swappable)

Every data domain has a repository file. Repositories are the ONLY layer that touches storage. When migrating to Supabase, only repository files change — zero changes to hooks, components, or business logic.

```typescript
// Current (localStorage)
export const transactionRepository = {
  getAll(): Transaction[] {
    return JSON.parse(localStorage.getItem("finance_os_tx") ?? "[]");
  },
  saveAll(transactions: Transaction[]) {
    localStorage.setItem("finance_os_tx", JSON.stringify(transactions));
  },
  add(t: Transaction) { ... }
};

// Future (Supabase) — same interface, different implementation
export const transactionRepository = {
  async getAll(): Promise<Transaction[]> {
    const { data } = await supabase
      .from("transactions")
      .select()
      .eq("user_id", currentUser.id);
    return data;
  },
  ...
};
```

### TransactionForm — Universal Entry Point

`TransactionForm.tsx` is the single modal used for ALL transaction creates and edits across the entire app. No other component builds its own transaction form.

Every entry point passes a `TransactionFormInitial` object to pre-fill the form, and `onSaved` callback to handle post-save actions.

---

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

## 6. Storage Keys

| Key | Type | Description |
|---|---|---|
| `finance_os_accounts` | `Account[]` | Bank and cash accounts |
| `finance_os_cards` | `CreditCard[]` | Credit cards |
| `finance_os_tx` | `Transaction[]` | **Master table — single source of truth** |
| `finance_os_categories` | `Category[]` | Expense/income categories |
| `finance_os_business` | `Business` | Business config, invoices, CRA |
| `finance_os_vehicles` | `Vehicle[]` | Vehicle assets |
| `finance_os_house_loans` | `HouseLoan[]` | Mortgage and loan assets |
| `finance_os_property_taxes` | `PropertyTax[]` | Property tax schedules |
| `finance_os_fixed_payments` | `FixedPayment[]` | Recurring payment definitions |
| `finance_os_dismissed_pending` | `string[]` | Keys of dismissed pending alerts |

**Rule:** `finance_os_tx` is the only table that drives balance calculations. All other tables are configuration/definition tables that trigger or reference transactions.

---

## 7. Transaction System

### Transaction Types

#### User-facing types (selectable in TransactionForm)
| Type | Description | Balance Effect |
|---|---|---|
| `expense` | Money spent | Source account/card debited |
| `income` | Money received | Source account credited |
| `transfer` | Money between own accounts | Source debited, destination credited |
| `refund` | Return of a previous expense | Source account/card credited |
| `dividend` | Corporate dividend to self | Source account credited |

**Note:** `TransactionType` in the TypeScript type currently only includes `income | expense | transfer`. `refund` and `dividend` are planned additions — see Deferred Items.

#### System-assigned types (never shown to user as a choice)
| Type | Description | When |
|---|---|---|
| `adjustment` | Reconciliation correction | When account reconcile creates a balancing entry |
| `payroll` | Payroll income | When income source is flagged as T4 employment |

### Transfer Rules
- Always has `sourceId` (where money leaves) AND `destinationId` (where money arrives)
- No category field — transfers are not expenses or income
- Credit card payment: `sourceId` = bank account, `destinationId` = credit card
- CC to CC balance transfer: both source and destination are credit cards
- TFSA/RRSP contribution: `sourceId` = bank account, `destinationId` = investment account (when built)
- Loan receipt: `sourceId` = liability account (when built), `destinationId` = bank account

### Balance Effect by Type
```
expense:   account.balance -= amount  | card.balance += amount (more owed)
income:    account.balance += amount
refund:    account.balance += amount  | card.balance -= amount (less owed)
dividend:  account.balance += amount
transfer:  source.balance -= amount   | destination.balance += amount
           (for card destination: card.balance -= amount = less owed)
adjustment: applied as income or expense to bring balance to correct value
```

### What Is NOT a Transaction
- Credit card payment (it IS a transfer)
- TFSA/RRSP contribution (it IS a transfer)
- Loan receipt (it IS a transfer from liability account)
- CRA HST remittance (it IS an expense from business account)

---

## 8. Balance Architecture

### The Rule
`openingBalance` on Account and CreditCard is a **computed value**. It is derived by replaying all transactions from zero. It is NEVER set directly by any UI component or hook.

### The Flow
```
Any transaction write
        ↓
transactionRepository.add/saveAll()
        ↓
syncBalances()          ← utils/syncBalances.ts
        ↓
recalculateBalances()   ← utils/recalculateBalances.ts
  - reads all transactions
  - resets all balances to 0
  - replays each transaction applying balance effects
  - wraps every operation in toFixed2() to prevent float drift
        ↓
accountRepository.saveAll(newAccounts)
creditCardRepository.saveAll(newCards)
```

### recalculateBalances.ts
```typescript
export function recalculateBalances(transactions: Transaction[]) {
  const accounts = accountRepository.getAll();
  const cards = creditCardRepository.getAll();

  accounts.forEach((a) => (a.openingBalance = 0));
  cards.forEach((c) => (c.openingBalance = 0));

  for (const t of transactions) {
    // apply toFixed2() on EVERY mutation to prevent floating point drift
    if (t.type === "expense") { ... }
    if (t.type === "income") { ... }
    if (t.type === "transfer" && t.destinationId) { ... }
  }

  accountRepository.saveAll(accounts);
  creditCardRepository.saveAll(cards);
}
```

### Performance Note
Full replay on every write. Suitable for up to ~5,000 transactions. Beyond that, migrate to incremental delta updates or database-level computed columns in Supabase.

---

## 9. Event System

File: `utils/events.ts`

```typescript
export const DATA_CHANGED_EVENT = "financeOS:dataChanged";

export function notifyDataChanged(domain?: string) {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { domain } }));
}
```

**Pattern:** Every hook listens for `DATA_CHANGED_EVENT` and reloads its data. This solves cross-domain refresh — when DailyLog writes a transaction, BankAccounts section automatically shows updated balance without any prop drilling or shared state.

**Usage in hooks:**
```typescript
useEffect(() => {
  const handler = () => load();
  window.addEventListener(DATA_CHANGED_EVENT, handler);
  return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
}, [load]);
```

**After any write sequence:**
```typescript
transactionRepository.add(txn);
syncBalances();
notifyDataChanged("transactions");
```

---

## 10. Repository Pattern

All repositories follow the same interface pattern:

```typescript
export const [domain]Repository = {
  getAll(): T[] { ... },
  saveAll(items: T[]): void { ... },
  add(item: T): void { ... },
  update(item: T): void { ... },    // optional
  delete(id: string): void { ... }, // optional
};
```

### Current implementations (localStorage)
Each repository reads/writes a single localStorage key as a JSON array or object.

### Migration to Supabase
Only these files change. Everything above the repository layer remains identical. Each method becomes an async Supabase query scoped to `user_id`.

---

## 11. Module Map

### Hooks (data layer)

| Hook | File | Responsibilities |
|---|---|---|
| `useAccounts` | modules/accounts/useAccounts.ts | CRUD for bank accounts, reload on event |
| `useCreditCards` | modules/creditCards/useCreditCards.ts | CRUD for credit cards |
| `useTransactions` | modules/transactions/useTransactions.ts | Read transactions, add/delete/update + syncBalances |
| `useCategories` | modules/categories/useCategories.ts | CRUD + auto-seed defaults + smart delete/archive |
| `useFixedPayments` | modules/business/useFixedPayments.ts | Fixed payments + pending generation + auto-advance dates |
| `useBusiness` | modules/business/useBusiness.ts | Business domain — invoices, CRA, rate settings |
| `useVehicles` | modules/business/useAssets.ts | Vehicle CRUD |
| `useHouseLoans` | modules/business/useAssets.ts | House loan CRUD |
| `usePropertyTax` | modules/business/useAssets.ts | Property tax CRUD |

### UI Sections

| Section | File | Nav Location |
|---|---|---|
| Daily Log | DailyLogSection.tsx | Daily Activity |
| Transaction History | CoreSections.tsx → TransactionHistorySection | Daily Activity |
| Dashboard | DashboardProjectionSections.tsx → DashboardSection | Daily Activity |
| Projection | DashboardProjectionSections.tsx → ProjectionSection | Daily Activity |
| Import/Export | ImportExportSection.tsx | Daily Activity |
| Overview | CoreSections.tsx → OverviewSection | Personal Finance |
| Bank Accounts | CoreSections.tsx → BankAccountsSection | Personal Finance |
| Credit Cards | CoreSections.tsx → CreditCardsSection | Personal Finance |
| Fixed Payments | FixedPaymentsSection.tsx | Personal Finance |
| Vehicles | AssetsSections.tsx → VehiclesSection | Personal Finance |
| House Loans | AssetsSections.tsx → HouseLoansSection | Personal Finance |
| Property Tax | AssetsSections.tsx → PropertyTaxSection | Personal Finance |
| Categories | CategoriesSection.tsx | Personal Finance |
| Hours & Contracts | HoursContractsSection.tsx | Business / CRA |
| Corp Income | CorporationIncomeTaxRateSections.tsx → CorporationIncomeSection | Business / CRA |
| Tax Obligations | TaxObligationsSection.tsx | Business / CRA |
| Tax & Rate Settings | CorporationIncomeTaxRateSections.tsx → TaxRateSettingsSection | Business / CRA |

---

## 12. Navigation Structure

Defined in `app/page.tsx` as a `NAV` array. Three groups:

```
Daily Activity
  📓 Daily Log          (id: "dailylog")
  📋 Transaction History (id: "transactions")
  🏠 Dashboard          (id: "dashboard")
  📈 Projection         (id: "projection")
  💾 Import / Export    (id: "importexport")

Personal Finance
  🏠 Overview           (id: "overview")
  🏦 Bank Accounts      (id: "accounts")
  💳 Credit Cards       (id: "cards")
  📅 Fixed Payments     (id: "fixedpayments")
  🚗 Vehicles           (id: "vehicles")
  🏡 House Loans        (id: "houseloans")
  🏛 Property Tax       (id: "propertytax")
  🏷 Categories         (id: "categories")

Business / CRA
  ⏱ Hours & Contracts  (id: "hourscontracts")
  💼 Corp Income        (id: "corpincome")
  📊 Tax Obligations    (id: "cra")
  ⚙️ Tax & Rate Settings (id: "ratesettings")
```

Sidebar: dark `#1e2530` background. Active item: `rgba(255,255,255,.1)` background with `#4a9eff` left border.

---

## 13. Business Rules

### TransactionForm Rules
- Amount must be > 0 (hard validation)
- Source account/card must be selected (hard validation)
- Category hidden and not required for transfers
- Warning shown when: credit card selected as income source, amount differs from scheduled amount, no category selected for expense/income
- `createdAt` always set to `new Date().toISOString()` — when user records it
- `date` field set to form date input sliced to YYYY-MM-DD — accounting date

### Category Rules
- 24 default categories seeded on first run (when localStorage is empty)
- Smart delete: if transactions exist → archive only; if zero transactions → hard delete
- Archived categories: hidden from all dropdowns, existing transactions remain linked and display correctly
- Category type determines which transactions it appears on (expense/income/both)
- `vehicleLinked: true` → shows vehicle + odometer fields in TransactionForm
- `propertyLinked: true` → shows property selector in TransactionForm

### Primary Account/Card Rules
- Accounts and cards can be marked as primary
- Primary items appear first in all dropdowns with ★ prefix
- Multiple primaries allowed (e.g. one primary bank + one primary card)
- `buildSourceOptions()` in `utils/finance.ts` handles sorting

### Fixed Payment Rules
- `date` field is the anchor date — it auto-advances after each confirmed or logged payment
- `advanceOneInterval()` in `utils/finance.ts` handles advancement
- Monthly schedule advances by calendar month (not 30 days) to prevent date drift
- Annual schedule advances by calendar year
- One-time payments do not advance
- Pending banner shows in Daily Log for all overdue/due payments

### Auto-Advance Rules (after payment confirmed)
- Fixed payment `date` → advance by schedule
- Vehicle `nextPaymentDate` → advance by schedule
- House loan `nextPaymentDate` → advance by schedule

### Fiscal Year Rules (Canadian)
- Fiscal year runs April 1 → March 31
- FY2027 = April 2026 to March 2027
- `currentWorkFiscalYear()` returns current FY based on today's date
- All invoice grouping and HST calculations use this FY definition

### Balance Calculation Rules
- All balances reset to 0 then replayed on every `syncBalances()` call
- `toFixed2()` applied to every arithmetic operation — prevents floating point drift
- Transfer requires `destinationId` — without it, only source is debited
- Refund reverses expense direction (account credited, card debited)

### Reconciliation (current)
- Direct `openingBalance` override — bypasses transaction replay
- **Known issue:** Should create an adjustment transaction instead
- See Deferred Items

---

## 14. Import & Export

### Export
- Full JSON export of all localStorage domains
- CSV export of transaction history (date, type, amount, category, account, mode, tag, description, vehicle, property)
- Export includes all domains: accounts, cards, transactions, categories, business, vehicles, house loans, property taxes, fixed payments

### Import (current state — to be replaced)
- Accepts the app's own JSON export
- Also accepts legacy prototype JSON (migration path — to be removed)
- Migration maps: account names → IDs, category names → IDs

### Import (target state)
- ONLY accept files exported by FinanceOS itself
- Validate `meta.signature === "FINANCEOS-v1"` before processing
- Validate `meta.exportedBy === "FinanceOS"`
- Hard reject any file missing the signature
- Prototype import path to be removed entirely

### Export Format (target)
```json
{
  "meta": {
    "signature": "FINANCEOS-v1",
    "exportedBy": "FinanceOS",
    "appVersion": "1.0",
    "exportedAt": "2026-04-13T18:00:00.000Z"
  },
  "accounts": [...],
  "cards": [...],
  "transactions": [...],
  "categories": [...],
  "business": {...},
  "vehicles": [...],
  "houseLoans": [...],
  "propertyTaxes": [...],
  "fixedPayments": [...]
}
```

---

## 15. Date & Time Standard

### Storage Rules
| Field | Format | Set By | Example |
|---|---|---|---|
| `createdAt` | ISO UTC string | `new Date().toISOString()` | `"2026-04-13T18:00:00.000Z"` |
| `date` | YYYY-MM-DD | User input (accounting date) | `"2026-04-13"` |
| `nextPaymentDate` | YYYY-MM-DD | `advanceOneInterval()` | `"2026-05-06"` |
| `effectiveFrom` | YYYY-MM-DD | User input | `"2026-01-01"` |

### Key Rules
- `createdAt` = when user recorded the transaction — always `now`, never derived from date input
- `date` = accounting date — can be backdated, used for filtering and reporting
- `date` always wins for filtering/sorting/display over `createdAt`
- All date-only comparisons use `.slice(0, 10)` to get YYYY-MM-DD
- `fmtDate()` appends `T12:00:00` before passing to `new Date()` to avoid timezone boundary issues
- Display in form uses `createdAt` for full datetime, `date` for date-only fields

### Historical Data Note
Prototype-imported transactions have mixed `createdAt` formats:
- `"2026-04-06T11:15"` — 16 chars, no timezone (most common)
- `"2026-04-07T17:58:00.000Z"` — full UTC with Z
- `"2026-04-04T08:56:00"` — 19 chars no timezone

`TransactionForm` handles all three formats when pre-filling the edit form. Going forward all new transactions use full ISO UTC format.

---

## 16. Deferred Items

### 1. Transaction Types — refund and dividend
**What:** Add `refund` and `dividend` as user-selectable transaction types in `TransactionForm`  
**Why deferred:** Core architecture being stabilized first  
**Why it matters:** Refund must not inflate income (tax implication). Dividend has different T1 tax treatment than employment income  
**Suggested approach:** Add to `TransactionType` union in `types/transaction.ts`. Update `recalculateBalances` — refund reverses expense direction. Add to `TransactionForm` type dropdown. Update all totals/filters to handle new types

### 2. Single Source of Truth — Reconcile
**What:** Reconcile currently directly writes `openingBalance`, bypassing `recalculateBalances`  
**Why deferred:** Architectural refactor needed  
**Why it matters:** Creates balance drift — reconciled balance gets overwritten on next `syncBalances()` call  
**Suggested approach:** When reconcile is triggered, calculate difference between stated balance and calculated balance, create an `adjustment` type transaction for that difference, let `syncBalances()` pick it up naturally

### 3. Liabilities Domain
**What:** Personal loans, lines of credit tracked as liability accounts  
**Why deferred:** Requires new domain — accounts payable, loan tracking  
**Why it matters:** Loan receipts currently logged as income (inflates taxable income). Loan repayments need to reduce liability balance not expense totals. Net worth calculation requires Assets − Liabilities  
**Suggested approach:** New `LiabilityAccount` type (id, name, lender, principal, remaining, interestRate, startDate). Loan receipt = transfer from liability account to bank. Repayment = transfer from bank to liability account. New `finance_os_liabilities` storage key

### 4. Income Sources + RRSP/TFSA Module
**What:** Expected recurring income sources, RRSP/RRSP contribution tracking  
**Why deferred:** Needed for accurate projection but complex domain  
**Why it matters:** Projection currently shows $0 expected income. TFSA/RRSP contributions must be transfers not expenses  
**Suggested approach:** `IncomeSource` type already defined in `domain.ts`. `InvestmentAccount` type already defined. Build UI for managing these. Wire into 30-day and monthly projection expected income calculations

### 5. Date/Time Utility Engine
**What:** Single `utils/dateTime.ts` module that all code uses for date operations  
**Why deferred:** Being discussed at time of documentation  
**Why it matters:** Date handling currently scattered across files with inconsistent patterns  
**Suggested approach:** Export `nowISO()`, `toDateOnly()`, `toDateTimeLocal()`, `displayDate()`, `displayDateTime()`. All components import from here. Single place to change format if needed

### 6. Import Signature Validation
**What:** Reject any JSON import that doesn't have `meta.signature === "FINANCEOS-v1"`  
**Why deferred:** Import/export being stabilized  
**Why it matters:** Prevents importing prototype data, random JSON, or data from other tools. Ensures data quality going forward  
**Suggested approach:** Add signature to export. Check signature first in import handler. Hard reject with clear error message. Remove prototype migration path entirely

### 7. Dashboard + Projection Income
**What:** Wire income sources into Dashboard expected income and Projection calculations  
**Why deferred:** Income Sources module not built yet  
**Why it matters:** Dashboard shows $0 expected income currently. Projection can't show accurate cashflow without expected income

### 8. Excel/PDF Export
**What:** Export projection and monthly reports as Excel or PDF  
**Why deferred:** Nice to have, not core  
**Suggested approach:** Use `xlsx` npm package for Excel. Use `jsPDF` or server-side PDF generation for PDF reports

### 9. Data Health Page
**What:** Page showing data quality issues — orphaned categoryIds, missing sourceIds, duplicate transactions  
**Why deferred:** Low priority during active development  
**Suggested approach:** Scan all transactions for references to deleted accounts/categories. Show count of issues with fix suggestions

### 10. Tax Summary Page
**What:** T1 and T2 guidance page mapping transaction data to CRA line numbers  
**Why deferred:** Requires stable data model and income sources  
**Why it matters:** Core vision of the product — self-generate tax filing data  
**Suggested approach:** T1 section (employment income, RRSP deductions, medical expenses). T2 section (business income, deductible expenses by category, HST summary). Map existing categories to CRA line numbers

### 11. Year-over-Year Analysis
**What:** Compare spending, income, net worth across fiscal years  
**Why deferred:** Need sufficient historical data first

### 12. Mortgage Principal/Interest Split
**What:** Separate principal repayment (balance sheet) from interest (true expense)  
**Why deferred:** Requires amortization calculation  
**Why it matters:** Currently full mortgage payment counted as expense — overstates expenses. Interest only is the true expense. Important for rental income tax calculations

---

## 17. Cloud Migration Plan

### Current State
All data in browser localStorage. Single user. No authentication. No server.

### Target State
Supabase backend. Multi-user. Authentication. Real-time sync.

### Migration Steps

**Phase 1 — Supabase Setup**
1. Create Supabase project
2. Create tables matching current storage keys (transactions, accounts, cards, categories, etc.)
3. Add `user_id UUID` column to every table
4. Enable Row Level Security (RLS) — `user_id = auth.uid()` on all tables
5. Create Supabase Auth project

**Phase 2 — Repository Swap**
1. Replace each `[domain]Repository` file with Supabase implementation
2. Change all methods to `async` (hooks need `await`)
3. All queries filtered by `user_id`
4. Zero changes to hooks, components, or business logic

**Phase 3 — Auth**
1. Login/Register pages
2. Session management — redirect to login if not authenticated
3. Auth context provider wrapping the app
4. SSO options (Google, Apple)

**Phase 4 — Data Migration**
1. One-time script: export from localStorage → import to Supabase for each user
2. Validate all records migrated correctly
3. Remove localStorage fallback

### Supabase Table Structure
```sql
-- Every table follows this pattern
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  source_id UUID,
  destination_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE,
  category_id UUID,
  tag TEXT,
  mode TEXT,
  linked_vehicle_id UUID,
  linked_property_id UUID,
  odometer TEXT
);

-- Row Level Security
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own data" ON transactions
  FOR ALL USING (user_id = auth.uid());
```

### Performance Considerations
- Full transaction replay (`recalculateBalances`) works fine in localStorage
- With Supabase: move balance calculation to database-level computed columns or materialized views
- Alternative: store running balance as a separate `account_balances` table, updated via database triggers on transaction insert/update/delete

---

## 18. Commercial Product Vision

### Two Deployment Tracks

**Track 1 — Personal**
- Single Supabase instance owned by the developer
- Single user or small family
- No subscription management
- Developer controls all data
- Used for dogfooding — test features before commercial release

**Track 2 — Commercial Product**
- Shared Supabase instance with RLS enforcing tenant isolation
- Full registration and onboarding flow
- Subscription tiers
- Accountant read-only access sharing
- Data export on account cancellation
- PIPEDA compliance

### Target Users (Commercial)
- Independent contractors in Canada billing T4A income
- Incorporated business owners (corp + personal finance)
- Full-time employees wanting to track expenses for tax purposes

### Subscription Tiers (proposed)
| Tier | Features | Target |
|---|---|---|
| Free | Basic transaction tracking, 1 account, 1 card | Trial users |
| Personal ($8/mo) | Unlimited accounts/cards, projections, fixed payments | Employees |
| Pro ($18/mo) | + Business domain, HST tracking, invoice log, CRA obligations | Contractors |
| Business ($28/mo) | + Corp income, T2 guidance, accountant access, Excel export | Incorporated |

### PIPEDA Compliance Requirements
Since FinanceOS handles personal financial data of Canadian users:
- Privacy policy explaining what data is collected and why
- Data retention policy — how long data is kept after account cancellation
- User data export on request
- User data deletion on request
- Breach notification process
- Data stored in Canadian or acceptable jurisdiction data centres

### Accountant Access Feature
- User can generate a read-only share link for their accountant
- Accountant sees transaction history, categories, CRA obligations
- Accountant cannot add/edit/delete anything
- Access expires after a set date or on user revocation
- Implemented via Supabase RLS role system

### Multi-Tenant Architecture
```
Every Supabase query:
  .eq("user_id", supabase.auth.user().id)

RLS policy ensures:
  No user can ever read another user's data
  Even with a bug in app code, database blocks cross-tenant access
```

---

## Appendix A — Default Categories

24 categories seeded on first run:

**Expense (Personal):** Gas, Groceries, Dining & Food, Shopping, Utilities, Insurance, Subscriptions, Entertainment, Transportation, Medical, Home Maintenance, Education, Clothing, Personal Care, Car Maintenance

**Expense (Business):** Business Expense, CRA Remittance, Professional Dev., Office Supplies, Software & Tools, Phone & Internet

**Income:** Employment Income, Business Income, Investment Return, Other Income

---

## Appendix B — Key Utility Functions

```typescript
// utils/finance.ts
toFixed2(n: number): number                          // prevents float drift
fmtCAD(n: number): string                            // "$1,234.56"
fmtDate(d: string): string                           // "Apr 13, 2026"
toMonthly(amount, schedule): number                  // normalize to monthly
getRateOnDate(rateHistory, dateStr): RateEntry        // historical rate lookup
getNextOccurrence(dateStr, schedule): string          // next future date
advanceOneInterval(dateStr, schedule): string         // advance by exactly 1 period
currentWorkFiscalYear(): number                      // current Canadian FY
workFiscalYear(month, year): number                  // FY for given month/year
buildSourceOptions(accounts, cards): Option[]         // sorted with ★ primaries first
sortByPrimary(items): items                          // primary items first

// utils/syncBalances.ts
syncBalances(): void                                 // THE balance update entry point

// utils/events.ts
notifyDataChanged(domain?: string): void             // fire after any write

// utils/dateTime.ts (planned)
nowISO(): string                                     // new Date().toISOString()
toDateOnly(str): string                              // any format → YYYY-MM-DD
toDateTimeLocal(str): string                         // any format → YYYY-MM-DDTHH:MM
```

---

## Appendix C — Replication Checklist

For any developer replicating this app from scratch:

1. `npx create-next-app@14 finance-os --typescript`
2. Set `"@/*": ["./*"]` in `tsconfig.json`
3. Build types in order: `transaction.ts` → `account.ts` → `creditCard.ts` → `category.ts` → `domain.ts`
4. Build repositories — one file per domain, localStorage implementation
5. Build `utils/finance.ts`, `utils/events.ts`, `utils/recalculateBalances.ts`, `utils/syncBalances.ts`
6. Build hooks in order: `useAccounts` → `useCreditCards` → `useCategories` → `useTransactions` → `useFixedPayments` → `useBusiness` → `useAssets`
7. Build `TransactionForm.tsx` — the universal modal
8. Build section components — each imports hooks, uses `TransactionForm` for all writes
9. Build `app/page.tsx` — sidebar nav, section routing
10. Build `ImportExportSection.tsx` last

**Critical constraints to maintain:**
- Never write `openingBalance` directly — always go through `syncBalances()`
- Never build a custom transaction form — always use `TransactionForm`
- Always call `notifyDataChanged()` after any repository write
- Always call `syncBalances()` after any transaction write
- `createdAt` = `new Date().toISOString()` always, never derived from date input

