# FinanceOS Technical Documentation

## Selectable Projection Horizons

The daily projection supports 30, 60, 90, and 120-day horizons. The selected
horizon is passed to recurring event generation and card/LOC debt projection;
what-if events and LOC exposure are constrained to the same end date. Longer
horizons suppress quiet days in the visible list while retaining every event and
low-balance warning. This is a presentation optimization only and does not omit
days from running-balance calculation.

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
