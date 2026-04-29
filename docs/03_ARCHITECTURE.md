# FinanceOS Technical Documentation

## 4. Architecture Overview

### Core Principle: Single Source of Truth

```
User action (add/edit/delete transaction)
        ↓
Write to transaction repository
        ↓
syncBalances()
        ↓
recalculateBalances() replays all applicable ledger rows
        ↓
accountRepository.saveAll() + creditCardRepository.saveAll()
        ↓
notifyDataChanged()
        ↓
UI reloads from hooks
```

### Balance Flow
- Transactions are the master ledger.
- Balances are recomputed from transactions after every write.
- `openingBalance` is treated as the current computed balance and is not authoritative by itself.

### Repository Layer
- All storage access is centralized in repository files.
- This cleanly separates UI and domain logic from persistence.
- The current implementation uses localStorage; a future swap to Supabase should only require repository changes.

### TransactionForm
- `TransactionForm.tsx` is the universal entry point for all transaction creates and edits.
- No other component should build an independent transaction form.
- Each section passes `initial` state and `onSaved` callbacks into the form.
