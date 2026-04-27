# FinanceOS Technical Documentation

## 8. Balance Architecture

### The Rule
`openingBalance` on Account and CreditCard is a **computed value**. It is derived by replaying all transactions from zero. It is NEVER set directly by any UI component or hook.

### The Flow
```
Any transaction write
        ↓
transactionRepository.add/saveAll()
        ↓
syncBalances()          ← utils/syncBalances.ts
        ↓
recalculateBalances()   ← utils/recalculateBalances.ts
  - reads all transactions
  - resets all balances to 0
  - replays each transaction applying balance effects
  - wraps every operation in toFixed2() to prevent float drift
        ↓
accountRepository.saveAll(newAccounts)
creditCardRepository.saveAll(newCards)
```

### recalculateBalances.ts
```typescript
export function recalculateBalances(transactions: Transaction[]) {
  const accounts = accountRepository.getAll();
  const cards = creditCardRepository.getAll();

  accounts.forEach((a) => (a.openingBalance = 0));
  cards.forEach((c) => (c.openingBalance = 0));

  for (const t of transactions) {
    // apply toFixed2() on EVERY mutation to prevent floating point drift
    if (t.type === "expense") { ... }
    if (t.type === "income") { ... }
    if (t.type === "transfer" && t.destinationId) { ... }
  }

  accountRepository.saveAll(accounts);
  creditCardRepository.saveAll(cards);
}
```

### Performance Note
Full replay on every write. Suitable for up to ~5,000 transactions. Beyond that, migrate to incremental delta updates or database-level computed columns in Supabase.

---

## 9. Event System

File: `utils/events.ts`

```typescript
export const DATA_CHANGED_EVENT = "financeOS:dataChanged";

export function notifyDataChanged(domain?: string) {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { domain } }));
}
```

**Pattern:** Every hook listens for `DATA_CHANGED_EVENT` and reloads its data. This solves cross-domain refresh — when DailyLog writes a transaction, BankAccounts section automatically shows updated balance without any prop drilling or shared state.

**Usage in hooks:**
```typescript
useEffect(() => {
  const handler = () => load();
  window.addEventListener(DATA_CHANGED_EVENT, handler);
  return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
}, [load]);
```

**After any write sequence:**
```typescript
transactionRepository.add(txn);
syncBalances();
notifyDataChanged("transactions");
```

---

