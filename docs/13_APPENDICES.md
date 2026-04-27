# FinanceOS Technical Documentation

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

