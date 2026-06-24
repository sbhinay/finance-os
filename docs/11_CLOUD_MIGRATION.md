# FinanceOS Technical Documentation

## 12. Cloud Migration Plan

### Current State
- Browser localStorage remains the primary working store
- Single-user mode
- No authentication
- App state lives entirely client-side
- Manual JSON export/import remains available as the safest portable backup path.
- Manual Supabase cloud save and manual restore preview exist as guarded backup/restore groundwork.
- Automatic cloud write-back is intentionally not active because overwrite guards, conflict detection, and sync-state visibility are not strong enough yet.

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
- App access on phone should come first through the deployed web app, not a native mobile rewrite.
- Keep cloud behavior manual until snapshot history and overwrite protection are reliable enough for cloud-first use.

### Migration Roadmap
1. Map localStorage keys to Supabase tables.
2. Keep manual cloud save/restore preview stable and guarded.
3. Add snapshot history, overwrite guards, and conflict protection.
4. Add authentication and user-scoped repositories.
5. Implement repository layer swap only after guarded persistence is proven.
6. Migrate local data to Supabase in a one-time import script.
7. Add first-load logic that offers to upload existing local browser data into the cloud if cloud storage is empty.
8. Add visible save/sync status in the UI once cloud persistence becomes primary.
9. Remove localStorage fallback only after validation.

### Phase 1 Setup Artifacts
- `.env.example` now documents the required public Supabase variables.
- `lib/supabase/client.ts` provides the shared browser client entry point.
- `supabase/01_phase1_schema.sql` defines the first user-owned schema and RLS policies.
- `supabase/README.md` captures the initial setup sequence for local development.

### Table Design Notes
- Store transactions, accounts, cards, categories, business, vehicles, house loans, property taxes, fixed payments.
- Add `user_id` to every table.
- Use Supabase RLS to enforce `user_id = auth.uid()`.

### Supabase Strategy
- Keep UI/business logic unchanged by preserving repository interfaces.
- Consider moving balance replay or running balances to database materialized views if transaction volume grows.
- Initial goal is reliability and backup safety, not advanced real-time collaboration.
