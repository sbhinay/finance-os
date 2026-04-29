# FinanceOS Technical Documentation

## 3. Project Structure

```
finance-os/
├── app/
│   └── page.tsx                          # Root layout, navigation, and section routing
├── modules/
│   ├── accounts/
│   │   └── useAccounts.ts                # Bank account hook
│   ├── categories/
│   │   └── useCategories.ts              # Category hook with seeded defaults
│   ├── creditCards/
│   │   └── useCreditCards.ts             # Credit card hook
│   ├── transactions/
│   │   └── useTransactions.ts            # Transaction CRUD + sync logic
│   └── business/
│       ├── TransactionForm.tsx           # Universal transaction entry/edit modal
│       ├── DailyLogSection.tsx           # Daily write log section
│       ├── CoreSections.tsx              # Bank/card overview + history
│       ├── DashboardProjectionSections.tsx
│       ├── FixedPaymentsSection.tsx
│       ├── HoursContractsSection.tsx
│       ├── TaxObligationsSection.tsx
│       ├── CorporationIncomeTaxRateSections.tsx
│       ├── AssetsSections.tsx            # Vehicles, House Loans, Property Tax
│       ├── CategoriesSection.tsx
│       ├── ImportExportSection.tsx
│       ├── useAssets.ts                  # Vehicle/loan/property hooks
│       ├── useBusiness.ts                # Business/CRA domain hook
│       └── useFixedPayments.ts           # Fixed payment and pending logic
├── repositories/
│   ├── accountRepository.ts
│   ├── creditCardRepository.ts
│   ├── transactionRepository.ts
│   ├── categoryRepository.ts
│   ├── businessRepository.ts
│   ├── fixedPaymentRepository.ts
│   └── assetRepositories.ts              # vehicle, houseLoan, propertyTax repos
├── rules/
│   ├── validationRules.ts
│   └── categoryRules.ts                  # Auto-detect and learned category rules
├── types/
│   ├── transaction.ts
│   ├── account.ts
│   ├── creditCard.ts
│   ├── category.ts
│   ├── domain.ts                         # Assets, payments, income sources
│   ├── business.ts
│   └── appData.ts
└── utils/
    ├── finance.ts                       # Formatting, rounding, schedules, date helpers
    ├── recalculateBalances.ts           # Balance replay engine
    ├── syncBalances.ts                  # Balance sync wrapper
    ├── events.ts                        # app-wide event bus
    ├── defaultCategories.ts             # seeded defaults
    └── migrationService.ts              # legacy import helpers
```

### Notes
- UI sections are composed from hooks and repositories, not direct storage access.
- The app is intentionally modular: business, accounts, cards, transactions, assets, and fixed payments are separate domains.
