# FinanceOS Technical Documentation

## Appendix A — Default Categories

### Expense (Personal)
Gas, Groceries, Dining & Food, Shopping, Utilities, Insurance, Subscriptions, Entertainment, Transportation, Medical, Home Maintenance, Education, Clothing, Personal Care, Car Maintenance

### Expense (Business)
Business Expense, CRA Remittance, Professional Dev., Office Supplies, Software & Tools, Phone & Internet

### Income
Employment Income, Business Income, Investment Return, Other Income

## Appendix B — Key Utility Functions

### `utils/finance.ts`
- `toFixed2(n)` — prevents floating point drift
- `fmtCAD(n)` — formatted CAD strings
- `fmtDate(d)` — display-friendly dates
- `toMonthly(amount, schedule)` — normalize recurring amount to monthly
- `getNextOccurrence(date, schedule)` — next scheduled date
- `advanceOneInterval(date, schedule)` — advance recurring anchor date
- `currentWorkFiscalYear()` — Canadian fiscal year logic
- `buildSourceOptions(accounts, cards)` — sort primaries first

### `utils/syncBalances.ts`
- `syncBalances()` — entry point for balance recomputation

### `utils/events.ts`
- `notifyDataChanged(domain?)` — publish a refresh event
