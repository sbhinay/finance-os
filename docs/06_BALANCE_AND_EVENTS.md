# FinanceOS Technical Documentation

## 8. Balance Architecture

### Current Rule
`openingBalance` is the current displayed balance for an account or credit card, but replay no longer assumes it is the permanent historical baseline.

Replay now starts from:
1. `reconciledBalance` if present
2. otherwise `balanceBase` if present
3. otherwise `0` when the account/card already has related transactions
4. otherwise the existing `openingBalance` for brand-new rows with no transaction history

This prevents old computed balances from being replayed on top of themselves.

### The Flow
```text
Any transaction write
        ↓
transactionRepository.add/saveAll()
        ↓
syncBalances()
        ↓
recalculateBalances()
  - loads accounts, cards, transactions
  - resets each row to its replay base
  - skips pending rows
  - skips future-dated rows
  - skips rows on/before reconciledDate for that source
  - replays all supported transaction types
        ↓
accountRepository.saveAll(accounts)
creditCardRepository.saveAll(cards)
```

### `recalculateBalances.ts`
Important behaviors in the current implementation:
- `getReplayBase()` uses `reconciledBalance` first, then `balanceBase`.
- If no baseline exists but related transactions do, replay starts from `0`.
- Replay no longer writes `balanceBase` from the currently computed `openingBalance`.
- `credit_card_payment` is handled directly.
- `adjustment` rows are replayed, but reconciliation rows can cancel out if source and destination are the same account/card.

### Reconcile Behavior
Reconcile flows now do two things:
1. Persist baseline metadata on the account/card
   - `balanceBase`
   - `reconciledBalance`
   - `reconciledDate`
2. Optionally create an audit transaction row
   - `type: "adjustment"`
   - `subType: "reconciliation"`

This gives the app:
- a stable starting balance for future replay
- an auditable history of reconcile actions

### Reporting Behavior
Reconciliation audit rows should not behave like ordinary spending.

Current expectation:
- excluded from Daily Log normal transaction list
- excluded from dashboard month totals and category-style summaries
- excluded from vehicle expense history
- excluded from general income/expense reporting

They remain in the transaction repository for traceability.

### Practical Result
After reconciling an account or card:
- older bad historical drift should not come back
- adding one new transaction should only move the balance by that one transaction
- replay after refresh should stay stable

---

## 9. Event System

File: `utils/events.ts`

```typescript
export const DATA_CHANGED_EVENT = "financeOS:dataChanged";

export function notifyDataChanged(domain?: string) {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { domain } }));
}
```

Pattern:
- Hooks listen for `DATA_CHANGED_EVENT` and reload local state.
- Typical write sequence:

```typescript
transactionRepository.add(txn);
syncBalances();
notifyDataChanged("transactions");
```

This is still the cross-module refresh mechanism after the balance model changes.

---
