# FinanceOS Technical Documentation

## Month-End Projection Horizons

The daily projection runs from today through a month end: End of Next Month, or
the end of the 3rd, 6th, or 9th month after the current month (for example, from
October 13: November 30, January 31, April 30, July 31). Today is included, so
items still scheduled for today affect the balance. The monthly view offers six
past and nine future months. Horizons longer than about two months hide quiet
days in the visible list and add month headers; every day is still in the
running balance.

## Calendar Schedule Dates

Recurring dates come from `utils/scheduleDates.ts`, never from fixed 30-day or
365-day steps:

- Monthly and annual occurrences are computed from the anchor (the next due
  date), not from the previous occurrence, so short months cannot drift later
  dates. A payment on the 30th falls on February 28 and returns to March 30.
- When a recurring payment has a `startDate`, its day of month is the preferred
  day. This also applies when a payment is logged early or late: the next due
  date stays on the scheduled day instead of moving to the logged day.
- An anchor on the last day of its month with no start date keeps landing on
  month ends, which matches how stored next-payment dates already advanced.
- Weekly and bi-weekly schedules step by calendar days, so daylight-saving
  changes cannot shift a date. Semi-monthly still uses 15-day steps until
  semi-monthly anchor days are modelled.
- Nothing is projected before an item's stored next due date.

## Per-Account Balances and Shortfalls

The combined projection pools every bank account. `utils/accountProjection.ts`
also runs each bank account's own balance from its current balance:

- Each event moves the bank account it names (by id or legacy account name).
  Bank-to-bank transfers move both accounts. Card-paid items move no bank
  account, because cash leaves the bank only when the card is paid.
- Items with no account (CRA payments, expected invoices, what-if income or
  expense with no account picked) affect the combined balance only.
- Any account that goes below $0 within the horizon is listed in "Accounts that
  go below $0" with the date, balance, causing payments, and lowest point, and
  the day it crosses is marked in the combined daily list.
- The daily view has an account picker. Choosing an account shows only that
  account's movements and running balance; the monthly view stays combined.
- What-if extra income and expense rows have an optional account.

## Borrowing and What-If Scenarios

- LOC draws are **borrowing**, not income. They raise the projected bank balance
  because the cash arrives, but they are shown in orange and totalled separately
  as Borrowed. Daily rows and monthly summaries show In, Out, Borrowed, and Net.
- A what-if LOC withdrawal is repaid in full on the LOC's first Next Payment
  Date strictly after the draw, and never before the stored next payment date.
  A draw before the payment date in the same month is repaid that month; a draw
  on or after it is repaid the following month. The repayment comes from the
  LOC's linked account. If the LOC has no Next Payment Date, a warning is shown
  and the draw stays in After Debt Exposure.
- Up to five named scenarios are saved in `finance_os_projection_scenarios`.
  They are part of cloud snapshots and JSON export/import, edits autosave, and
  "None" shows scheduled items only. Scenarios are projection-only: they never
  create transactions or change balances.

## 7. Balance Architecture and Events

### Balance Replay Logic
Balances are recomputed through replay every time transactions change.

#### Replay Base Rules
For each account/card, the replay starting point is determined as:
1. `balanceSnapshotAmount` when both `balanceSnapshotAmount` and `balanceSnapshotDate` are present
2. otherwise `0` if there are related transactions
3. otherwise the current `openingBalance` for rows with no history

This avoids compound replay drift from previously computed balances.

### Recalculate Logic
`recalculateBalances(transactions)` performs:
- load accounts and credit cards
- set each row to its replay base
- sort transactions by `date`, then `createdAt`
- skip `pending` status rows
- skip future-dated rows
- skip legacy reconciliation adjustment rows
- skip row application for an item when `txDate <= balanceSnapshotDate`
- apply transaction effects per type
- persist computed balances back to repositories

### Transaction Effects
`utils/transactionSemantics.ts#getTransactionEffect()` is the canonical implementation used by replay and ledger views.

- `expense`: source account decreases, source card increases
- `income`: source account increases, source card decreases
- `refund`: source account increases, source card decreases
- `transfer`: source decreases, destination increases
- `transfer + cc_payment`: source account decreases, destination card decreases
- `transfer + loc_draw`: source LOC decreases available credit / increases borrowed balance, destination cash account increases
- `adjustment`: source increases, destination decreases
- `loan_payment`: source cash decreases by the full payment amount

### Balance Snapshot Metadata
Accounts and cards now carry:
- `balanceSnapshotAmount`
- `balanceSnapshotDate`

These fields are the stable baseline for replay after the user enters a known real-world balance as of a specific statement/app date.

The current UI exposes snapshot entry and ledger explanation views from account/card records. Historical transactions on or before the snapshot date are not replayed for that item; transactions after the snapshot date are replayed from the snapshot amount.

### Event System
The app uses a custom event bus in `utils/events.ts`.

```typescript
export const DATA_CHANGED_EVENT = "financeOS:dataChanged";
export function notifyDataChanged(domain?: string) {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { domain } }));
}
```

Hooks listen for this event and reload from repositories.

### Write Pattern
Any write path should follow:
1. build or normalize a transaction through `services/transactionPipeline.ts`
2. persist through `persistCanonicalTransaction()`
3. let the pipeline call `syncBalances()` and `notifyDataChanged(...)`

Direct transaction insertion from feature pages is prohibited. Backfills may batch canonical rows, but must use semantic duplicate identity and perform one balance/event sync after the batch.

### Canonical Purpose
Transactions may carry a stable `purpose` such as `vehicle_lease_payment`, `mortgage_payment`, `credit_card_payment`, `purchase_refund`, or `personal_loan_receipt`. Purpose is independent of editable descriptions and category names. Existing rows receive only high-confidence inferred purposes during repository normalization.

### Secured debt balances
- Mortgages and financed vehicles use their own `balanceSnapshotAmount` and `balanceSnapshotDate` as the latest known owing anchor.
- Detailed mortgage views estimate principal and interest dynamically from the debt snapshot, date, rate, schedule, and linked payment history.
- Stored `principalAmount` / `interestAmount` fields are backward-compatible manual overrides or imported statement details, not normal app-generated ledger data.
- Later `loan_payment` rows reduce derived owing by manual principal when supplied, or by a clearly labeled render-time dynamic estimate when the loan has enough rate/snapshot data.
- FinanceOS-generated legacy estimate notes are treated as stale generated data, recalculated for display, and removed if the row is edited and saved without a deliberate statement-confirmed split.
- The full transaction `amount` always remains the cash-flow effect.
- `interestAmount` is reported as financing expense.
- Rows without enough information for a split remain valid regular-mode cash transactions and are shown as unallocated.

`transactionFingerprint()` combines purpose, transaction date, amount, accounts, and linked entities. It is used by backfills and Data Health instead of description matching.

### Invoice Deposits
Newly saved paid invoices create an `invoice_deposit` transaction linked with `linkedInvoiceId` and `depositTxnId`. The legacy virtual-deposit fallback in `syncBalances()` remains for older exports that do not yet contain a linked deposit transaction.

### Unified Asset Workflow Notes
- The new `Assets & Liabilities` page can now launch selected vehicle and property-tax actions directly into the canonical `TransactionForm`.
- These actions still follow the same write pipeline as every other manual ledger entry.
- Legacy `House Loans / Mortgages` now supports direct mortgage logging and backfill for missed historical scheduled payments.
- The unified `Assets & Liabilities` page still routes mortgage actions back to the legacy loan page until the principal-vs-interest UX is cleaner.
- Projection logic already uses full scheduled vehicle and house-loan payment amounts for cash planning regardless of expense categorization.
- Parent-owned recurring setup now feeds this same pipeline without bypassing the ledger:
  - account fees
  - card annual fees
  - vehicle insurance
  - house-loan property tax
- `Subscriptions` and `Planned Payments` are now dedicated recurring views, but they still create normal ledger transactions through the canonical form and shared write pattern.
