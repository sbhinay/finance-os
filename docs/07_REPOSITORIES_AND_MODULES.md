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
- `finance_os_properties`
- `finance_os_liabilities`
- `finance_os_property_taxes`
- `finance_os_fixed_payments`

### Module Map
| Hook | File | Responsibility |
|---|---|---|
| `useAccounts` | `modules/accounts/useAccounts.ts` | Account CRUD, primary status, fees, and balance snapshots |
| `useCreditCards` | `modules/creditCards/useCreditCards.ts` | Card CRUD, LOC/card behavior, payments, fees, and balance snapshots |
| `useTransactions` | `modules/transactions/useTransactions.ts` | Transaction CRUD and balance sync |
| `useCategories` | `modules/categories/useCategories.ts` | Category CRUD and defaults |
| `useFixedPayments` | `modules/business/useFixedPayments.ts` | Shared recurring definitions, stable start/next dates, pending generation, confirmation, Log Payment, backfill, archive, and origin links |
| `useBusiness` | `modules/business/useBusiness.ts` | Business domain normalization and CRA data |
| `useVehicles` | `modules/business/useAssets.ts` | Vehicle CRUD, history, and owned insurance recurring sync |
| `useHouseLoans` | `modules/business/useAssets.ts` | House loan CRUD and owned property-tax recurring sync |
| `useProperties` | `modules/business/useAssets.ts` | Property CRUD, safe legacy migration, owned insurance/property-tax recurring sync, and relationship maintenance |
| `useLiabilities` | `modules/business/useLiabilities.ts` | Lender CRUD/archive, snapshots, canonical relinking, summaries, running ledger, and principal-based balances |
| `usePropertyTax` | `modules/business/useAssets.ts` | Property tax CRUD |

### UI Sections
| Section | File | Notes |
|---|---|---|
| Daily Log | `modules/business/DailyLogSection.tsx` | Pending confirmations, quick entry, and recent transaction activity |
| Bank Accounts | `modules/business/CoreSections.tsx` | Includes account snapshot and ledger explanation flows |
| Credit Cards | `modules/business/CoreSections.tsx` | Includes card/LOC payment, snapshot, and ledger explanation flows |
| Assets & Liabilities | `modules/business/AssetsLiabilitiesSection.tsx` | Lender detail/edit, Borrow/Repay, snapshots, archive/restore, safe deletion, transaction attachment/relinking, and running debt ledger |
| Dashboard / Projection | `modules/business/DashboardProjectionSections.tsx` | Monthly actuals, projections, top categories |
| Health Report | `modules/business/HealthReportSection.tsx` | Warning-first integrity scan with canonical edit/relink, delete, category correction, dismissal, and restore actions |
| Recurring Payments | `modules/business/FixedPaymentsSection.tsx` | Shared recurring engine, filtered recurring views, pending alerts |
| Subscriptions | `modules/business/FixedPaymentsSection.tsx` | Dedicated subscription view backed by the recurring engine |
| Planned Payments | `modules/business/FixedPaymentsSection.tsx` | Planned recurring commitments with record-driven expense/transfer posting |
| Vehicles | `modules/business/AssetsSections.tsx` | Vehicle assets and linked transaction history |
| House Loans | `modules/business/AssetsSections.tsx` | Mortgage/loan assets, payment tracking, and property-tax ownership |
| Properties | `modules/business/PropertiesSection.tsx` | First-class property CRUD, linked mortgages/taxes, equity, carrying costs, recurring setup, and transaction history |
| Property Tax | `modules/business/AssetsSections.tsx` | Property tax schedules |
| Assets & Liabilities | `modules/business/AssetsLiabilitiesSection.tsx` | Unified transition page with upcoming obligations and selected direct actions |
| Import / Export | `modules/business/ImportExportSection.tsx` | Current-app export plus legacy migration support |
| Scan Statement | `modules/business/StatementScannerSection.tsx` | Image upload, editable candidates, duplicate review, and explicit canonical batch confirmation |

### Transition Notes
- The sidebar is now intentionally simplified around stronger hubs rather than exposing every detail page as a primary tab.
- The current top-level hub direction is:
  - `Daily Log`
  - `Dashboard`
  - `Accounts & Cards`
  - `Assets & Liabilities`
  - `Recurring Payments`
  - `Business`
  - `Data & Health`
- Detail pages like `Transaction History`, `Projection`, `Subscriptions`, `Planned Payments`, `Vehicles`, `House Loans`, `Property Tax`, and `Import / Export` remain active, but they are now intended to be reached from their parent hubs.
- `Assets & Liabilities` is now the new cross-domain shell for asset and debt workflows.
- Legacy `Vehicles`, `House Loans`, and `Property Tax` data remains compatible while Properties is the canonical parent view.
- New actions must use `services/transactionPipeline.ts`; interactive actions should prefer launching the canonical `TransactionForm`.
- `utils/transactionSemantics.ts` owns purpose inference, balance effects, report effects, list signs, and semantic duplicate identity.
- `services/transactionPipeline.ts` provides both single-row and batch canonical persistence; recurring and asset backfills use the batch path.
- `utils/finance.ts` owns shared calendar-safe forward/backward schedule advancement, including month-end preservation.
- `FixedPaymentsSection.tsx` is now serving as the shared recurring engine and also exports focused recurring views rather than acting only as a generic fixed-payments page.
- Vehicle and mortgage backfill now use `nextPaymentDate` as the preferred cadence anchor.
- Category add/edit UI now exposes vehicle/property linking flags used by `TransactionForm`.
- Parent records now own part of recurring setup directly:
  - accounts and cards own fee records
  - vehicles own insurance recurring items
  - properties own insurance and property-tax recurring items
- `utils/propertyMigration.ts` safely creates Property parents from house loans and merges standalone property-tax records only on an exact unique property-name match.
- Transaction History supports exact tag and recurring-origin filters in addition to account/card, category, subtype, and linked-item filters.
- Import preview exposes transaction-level source/destination relinking, exclusion, and explicit acceptance of normalized cleanup before any local write.
- `/api/statement-scanner` is the server-only image boundary; `lib/statementScanner` owns replaceable provider integration and response validation.
