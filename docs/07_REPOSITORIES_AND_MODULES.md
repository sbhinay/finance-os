# FinanceOS Technical Documentation

## 8. Repository Pattern and Modules

### Repository Pattern
Each domain has a repository file responsible for persistence.

#### Current contract
```typescript
export const [domain]Repository = {
  getAll(): T[];
  saveAll(items: T[]): void;
  add(item: T): void;
  update?(item: T): void;
  delete?(id: string): void;
};
```

#### LocalStorage keys
- `finance_os_accounts`
- `finance_os_cards`
- `finance_os_tx`
- `finance_os_categories`
- `finance_os_business`
- `finance_os_vehicles`
- `finance_os_house_loans`
- `finance_os_property_taxes`
- `finance_os_fixed_payments`

### Module Map
| Hook | File | Responsibility |
|---|---|---|
| `useAccounts` | `modules/accounts/useAccounts.ts` | Account CRUD and reconciliation metadata |
| `useCreditCards` | `modules/creditCards/useCreditCards.ts` | Card CRUD and payment/reconcile workflows |
| `useTransactions` | `modules/transactions/useTransactions.ts` | Transaction CRUD and balance sync |
| `useCategories` | `modules/categories/useCategories.ts` | Category CRUD and defaults |
| `useFixedPayments` | `modules/business/useFixedPayments.ts` | Fixed payment definition and pending generation |
| `useBusiness` | `modules/business/useBusiness.ts` | Business domain normalization and CRA data |
| `useVehicles` | `modules/business/useAssets.ts` | Vehicle CRUD and history |
| `useHouseLoans` | `modules/business/useAssets.ts` | House loan CRUD |
| `usePropertyTax` | `modules/business/useAssets.ts` | Property tax CRUD |

### UI Sections
| Section | File | Notes |
|---|---|---|
| Daily Log | `modules/business/DailyLogSection.tsx` | Excludes reconciliation adjustments from normal view |
| Bank Accounts | `modules/business/CoreSections.tsx` | Includes account reconcile flow |
| Credit Cards | `modules/business/CoreSections.tsx` | Includes card payment and reconcile flows |
| Dashboard / Projection | `modules/business/DashboardProjectionSections.tsx` | Monthly actuals, projections, top categories |
| Fixed Payments | `modules/business/FixedPaymentsSection.tsx` | Recurring payment definitions and pending alerts |
| Vehicles | `modules/business/AssetsSections.tsx` | Vehicle assets and linked transaction history |
| House Loans | `modules/business/AssetsSections.tsx` | Mortgage/loan assets and payment tracking |
| Property Tax | `modules/business/AssetsSections.tsx` | Property tax schedules |
| Import / Export | `modules/business/ImportExportSection.tsx` | Current-app export plus legacy migration support |
