# FinanceOS Technical Documentation

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

