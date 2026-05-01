# FinanceOS Technical Documentation

## 12. Cloud Migration Plan

### Current State
- Browser localStorage only
- Single-user mode
- No authentication
- App state lives entirely client-side
- Manual JSON export/import is the only backup path today, which means data loss is possible if the browser session is reset and the user has not exported recently.

### Future Target
- Supabase backend with PostgreSQL storage
- Row-level security by `user_id`
- Authentication and sessions
- Cross-device sync and multi-tenant isolation
- Cloud-first persistence so normal usage does not depend on manual backup habits

### Current Planning Direction
- A free Supabase account is sufficient for the first migration phase.
- Start with personal single-user cloud save before solving broader commercial multi-tenant concerns.
- Keep JSON export/import as backup and portability tools, not as the primary persistence model.

### Migration Roadmap
1. Map localStorage keys to Supabase tables.
2. Implement repository layer swap only.
3. Add authentication and user-scoped repositories.
4. Migrate local data to Supabase in a one-time import script.
5. Remove localStorage fallback after validation.
6. Add first-load logic that offers to upload existing local browser data into the cloud if cloud storage is empty.
7. Add visible save/sync status in the UI once cloud persistence becomes primary.

### Table Design Notes
- Store transactions, accounts, cards, categories, business, vehicles, house loans, property taxes, fixed payments.
- Add `user_id` to every table.
- Use Supabase RLS to enforce `user_id = auth.uid()`.

### Supabase Strategy
- Keep UI/business logic unchanged by preserving repository interfaces.
- Consider moving balance replay or running balances to database materialized views if transaction volume grows.
- Initial goal is reliability and backup safety, not advanced real-time collaboration.
