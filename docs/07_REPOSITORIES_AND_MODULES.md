# FinanceOS Technical Documentation

## 10. Repository Pattern

All repositories still use the same localStorage-first shape:

```typescript
export const [domain]Repository = {
  getAll(): T[] { ... },
  saveAll(items: T[]): void { ... },
  add(item: T): void { ... },
  update(item: T): void { ... },    // optional
  delete(id: string): void { ... }, // optional
};
```

Current note:
- `transactionRepository` remains the master ledger repository.
- `accountRepository` and `creditCardRepository` now persist replay baseline metadata in addition to current balances.

---

## 11. Module Map

### Hooks (data layer)

| Hook | File | Responsibilities |
|---|---|---|
| `useAccounts` | `modules/accounts/useAccounts.ts` | Account CRUD, account reconcile/edit behavior, reload on events |
| `useCreditCards` | `modules/creditCards/useCreditCards.ts` | Card CRUD, payment/reconcile support, reload on events |
| `useTransactions` | `modules/transactions/useTransactions.ts` | Add/update/delete transaction rows, trigger `syncBalances()` |
| `useCategories` | `modules/categories/useCategories.ts` | Category CRUD, archive behavior, defaults |
| `useFixedPayments` | `modules/business/useFixedPayments.ts` | Fixed payment CRUD, pending generation, auto-advance logic |
| `useBusiness` | `modules/business/useBusiness.ts` | Business/CRA domain with normalization of nested defaults |
| `useVehicles` | `modules/business/useAssets.ts` | Vehicle CRUD |
| `useHouseLoans` | `modules/business/useAssets.ts` | House loan CRUD |
| `usePropertyTax` | `modules/business/useAssets.ts` | Property tax CRUD |

### UI Sections

| Section | File | Notes |
|---|---|---|
| Daily Log | `modules/business/DailyLogSection.tsx` | Normal daily transactions; reconciliation adjustments should be excluded |
| Transaction History | `modules/business/CoreSections.tsx` | Cross-account history and edits |
| Dashboard | `modules/business/DashboardProjectionSections.tsx` | Month totals and category summaries |
| Projection | `modules/business/DashboardProjectionSections.tsx` | Forecasts based on recurring/business definitions |
| Import/Export | `modules/business/ImportExportSection.tsx` | Handles both current-app exports and legacy migration inputs |
| Bank Accounts | `modules/business/CoreSections.tsx` | Includes reconcile and metadata editing |
| Credit Cards | `modules/business/CoreSections.tsx` | Includes pay flow, reconcile flow, linked-account behavior |
| Fixed Payments | `modules/business/FixedPaymentsSection.tsx` | Recurring personal finance items |
| Vehicles | `modules/business/AssetsSections.tsx` | Vehicle assets and linked transaction history |
| House Loans | `modules/business/AssetsSections.tsx` | Mortgage/loan assets |
| Property Tax | `modules/business/AssetsSections.tsx` | Property tax schedules |
| Categories | `modules/business/CategoriesSection.tsx` | Category maintenance |
| Hours & Contracts | `modules/business/HoursContractsSection.tsx` | Business contracts/hours |
| Corp Income | `modules/business/CorporationIncomeTaxRateSections.tsx` | Corporate income and tax views |
| Tax Obligations | `modules/business/TaxObligationsSection.tsx` | CRA obligations |
| Tax & Rate Settings | `modules/business/CorporationIncomeTaxRateSections.tsx` | HST/corp/payroll rates |

### Important Current Cross-Cutting Rules
- Transaction writes should always be followed by `syncBalances()` and `notifyDataChanged(...)`.
- Reconcile flows update repository baseline metadata and may also create audit rows.
- Import/export is no longer just a prototype-migration concern; it must preserve current app state symmetrically.

---

## 12. Navigation Structure

Defined in `app/page.tsx` as grouped navigation:

```text
Daily Activity
  Daily Log
  Transaction History
  Dashboard
  Projection
  Import / Export

Personal Finance
  Overview
  Bank Accounts
  Credit Cards
  Fixed Payments
  Vehicles
  House Loans
  Property Tax
  Categories

Business / CRA
  Hours & Contracts
  Corp Income
  Tax Obligations
  Tax & Rate Settings
```

---
