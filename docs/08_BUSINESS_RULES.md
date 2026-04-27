# FinanceOS Technical Documentation

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

