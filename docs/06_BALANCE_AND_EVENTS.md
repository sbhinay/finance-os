# FinanceOS Technical Documentation

## 7. Balance Architecture and Events

### Balance Replay Logic
Balances are recomputed through replay every time transactions change.

#### Replay Base Rules
For each account/card, the replay starting point is determined as:
1. `reconciledBalance` if present
2. otherwise `balanceBase` if present
3. otherwise `0` if there are related transactions
4. otherwise the current `openingBalance` for rows with no history

This avoids compound replay drift from previously computed balances.

### Recalculate Logic
`recalculateBalances(transactions)` performs:
- load accounts and credit cards
- set each row to its replay base
- sort transactions by `date`, then `createdAt`
- skip `pending` status rows
- skip future-dated rows
- skip row application when `txDate <= reconciledDate`
- apply transaction effects per type
- persist computed balances back to repositories

### Transaction Effects
- `expense`: source account decreases, source card increases
- `income`: source account increases, source card decreases
- `transfer`: source decreases, destination increases
- `credit_card_payment`: source account decreases, destination card decreases
- `adjustment`: source increases, destination decreases

### Reconcile Metadata
Accounts and cards now carry:
- `balanceBase`
- `reconciledBalance`
- `reconciledDate`

These fields are the stable baseline for replay after reconciliation.

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
1. persist domain changes in repository
2. call `syncBalances()` when transactions or account/card balances change
3. call `notifyDataChanged(...)`
