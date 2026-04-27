# FinanceOS Technical Documentation

## 4. Architecture Overview

### Core Principle: Single Source of Truth

```
User action (add/edit/delete transaction)
        ↓
Write to finance_os_tx (transactionRepository)
        ↓
syncBalances() called
        ↓
recalculateBalances() replays ALL transactions from zero
        ↓
accountRepository.saveAll() + creditCardRepository.saveAll()
        ↓
notifyDataChanged() fires DATA_CHANGED_EVENT
        ↓
All hooks reload via event listener
        ↓
UI re-renders with correct data
```

**Critical rule:** `openingBalance` on accounts and cards is NEVER written directly by any component or hook. It is ONLY updated through `syncBalances()` → `recalculateBalances()`. Any code that directly mutates `openingBalance` outside this path is a bug.

### Repository Pattern (localStorage → Supabase swappable)

Every data domain has a repository file. Repositories are the ONLY layer that touches storage. When migrating to Supabase, only repository files change — zero changes to hooks, components, or business logic.

```typescript
// Current (localStorage)
export const transactionRepository = {
  getAll(): Transaction[] {
    return JSON.parse(localStorage.getItem("finance_os_tx") ?? "[]");
  },
  saveAll(transactions: Transaction[]) {
    localStorage.setItem("finance_os_tx", JSON.stringify(transactions));
  },
  add(t: Transaction) { ... }
};

// Future (Supabase) — same interface, different implementation
export const transactionRepository = {
  async getAll(): Promise<Transaction[]> {
    const { data } = await supabase
      .from("transactions")
      .select()
      .eq("user_id", currentUser.id);
    return data;
  },
  ...
};
```

### TransactionForm — Universal Entry Point

`TransactionForm.tsx` is the single modal used for ALL transaction creates and edits across the entire app. No other component builds its own transaction form.

Every entry point passes a `TransactionFormInitial` object to pre-fill the form, and `onSaved` callback to handle post-save actions.

---

