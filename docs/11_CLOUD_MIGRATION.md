# FinanceOS Technical Documentation

## 12. Cloud Migration Plan

### Current State
- Browser localStorage only
- Single-user mode
- No authentication
- App state lives entirely client-side

### Future Target
- Supabase backend with PostgreSQL storage
- Row-level security by `user_id`
- Authentication and sessions
- Cross-device sync and multi-tenant isolation

### Migration Roadmap
1. Map localStorage keys to Supabase tables.
2. Implement repository layer swap only.
3. Add authentication and user-scoped repositories.
4. Migrate local data to Supabase in a one-time import script.
5. Remove localStorage fallback after validation.

### Table Design Notes
- Store transactions, accounts, cards, categories, business, vehicles, house loans, property taxes, fixed payments.
- Add `user_id` to every table.
- Use Supabase RLS to enforce `user_id = auth.uid()`.

### Supabase Strategy
- Keep UI/business logic unchanged by preserving repository interfaces.
- Consider moving balance replay or running balances to database materialized views if transaction volume grows.
