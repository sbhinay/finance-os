# FinanceOS Technical Documentation

## 17. Cloud Migration Plan

### Current State
All data in browser localStorage. Single user. No authentication. No server.

### Target State
Supabase backend. Multi-user. Authentication. Real-time sync.

### Migration Steps

**Phase 1 — Supabase Setup**
1. Create Supabase project
2. Create tables matching current storage keys (transactions, accounts, cards, categories, etc.)
3. Add `user_id UUID` column to every table
4. Enable Row Level Security (RLS) — `user_id = auth.uid()` on all tables
5. Create Supabase Auth project

**Phase 2 — Repository Swap**
1. Replace each `[domain]Repository` file with Supabase implementation
2. Change all methods to `async` (hooks need `await`)
3. All queries filtered by `user_id`
4. Zero changes to hooks, components, or business logic

**Phase 3 — Auth**
1. Login/Register pages
2. Session management — redirect to login if not authenticated
3. Auth context provider wrapping the app
4. SSO options (Google, Apple)

**Phase 4 — Data Migration**
1. One-time script: export from localStorage → import to Supabase for each user
2. Validate all records migrated correctly
3. Remove localStorage fallback

### Supabase Table Structure
```sql
-- Every table follows this pattern
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  description TEXT,
  source_id UUID,
  destination_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE,
  category_id UUID,
  tag TEXT,
  mode TEXT,
  linked_vehicle_id UUID,
  linked_property_id UUID,
  odometer TEXT
);

-- Row Level Security
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own data" ON transactions
  FOR ALL USING (user_id = auth.uid());
```

### Performance Considerations
- Full transaction replay (`recalculateBalances`) works fine in localStorage
- With Supabase: move balance calculation to database-level computed columns or materialized views
- Alternative: store running balance as a separate `account_balances` table, updated via database triggers on transaction insert/update/delete

---

