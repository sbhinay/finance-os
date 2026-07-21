# FinanceOS Technical Documentation

## 4. Architecture Overview

### Core Principle: Single Source of Truth

```text
User action (add/edit/delete transaction)
  -> canonical transaction pipeline
  -> transaction repository write
  -> syncBalances()
  -> recalculateBalances() replay
  -> accountRepository.saveAll() + creditCardRepository.saveAll()
  -> notifyDataChanged()
  -> UI hooks reload
```

### Balance Flow
- Transactions are the master ledger.
- Balances are recomputed from transactions after every write.
- `openingBalance` is treated as the current computed balance and is not authoritative by itself.
- `balanceSnapshotAmount` and `balanceSnapshotDate` are the user-entered real-world anchor when available.
- Replay starts from the snapshot amount for that item and applies only transactions after the snapshot date.
- Legacy reconciliation adjustment rows are skipped by replay and are not the current balance-alignment workflow.

### Repository Layer
- All storage access is centralized in repository files.
- This cleanly separates UI and domain logic from persistence.
- The primary app remains local-first through repository-backed localStorage.
- Supabase is used for guarded backup/restore snapshots with revision checks, not as an automatic live write path.

### TransactionForm
- `TransactionForm.tsx` is the universal entry point for all transaction creates and edits.
- No other component should build an independent transaction form.
- Each section passes `initial` state and `onSaved` callbacks into the form.
