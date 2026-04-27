# FinanceOS Technical Documentation

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

