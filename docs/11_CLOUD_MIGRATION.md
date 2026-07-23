# FinanceOS Technical Documentation

## 12. Cloud Migration Plan

### Current State
- Supabase authentication gates the complete financial application.
- Google and email/password entry, recovery, deliberate identity linking, and
  session-scoped tokens are implemented.
- The latest user-owned cloud snapshot loads before financial hooks mount.
- Browser localStorage remains an authenticated working cache.
- Manual JSON export/import remains available as the safest portable backup path.
- Debounced automatic cloud save uses guarded revisions, append-only restore history,
  conflict detection, and visible save state.
- Current and historical cloud revisions always enter the existing import preview before replacing local data.
- Signed-in imports create a guarded cloud restore point before replacing local data.
- Signed-in Clear All creates a guarded restore point first and clears only FinanceOS-owned local keys, preserving authentication and device identity.
- Cloud status distinguishes local-only, synced, pending-upload, cloud-newer, and true two-sided conflict states.
- Signed-in pages recheck cloud revision on focus, visibility return, and a short polling interval to catch stale tabs.
- Final guarded save runs before manual or inactivity sign-out.

### Remaining Operational Target
- Supabase backend with PostgreSQL storage
- Row-level security by `user_id`
- Cross-device sync and multi-tenant isolation
- Production monitoring, retention policy, and independent restore drills

### Current Planning Direction
- A free Supabase account is sufficient for the first migration phase.
- Start with personal single-user cloud save before solving broader commercial multi-tenant concerns.
- Keep JSON export/import as backup and portability tools, not as the primary persistence model.
- App access on phone should come first through the deployed web app, not a native mobile rewrite.
- Keep JSON import/export as an independent recovery and portability path.

### Migration Roadmap
1. Guarded snapshot history and overwrite protection. Complete.
2. Pre-render authentication and user-owned cloud bootstrap. Complete.
3. Debounced autosave, visible status, retry, and stale-tab checks. Complete.
4. Final-save manual/inactivity sign-out and deliberate Google linking. Complete.
5. Production monitoring, retention/deletion policy, and restore drills. Pending.

### Phase 1 Setup Artifacts
- `.env.example` now documents the required public Supabase variables.
- `lib/supabase/client.ts` provides the shared browser client entry point.
- `supabase/01_phase1_schema.sql` defines the first user-owned schema and RLS policies.
- `supabase/02_guarded_snapshots.sql` defines read-only snapshot tables, append-only history, and the optimistic-lock save RPC.
- `supabase/README.md` captures the initial setup sequence for local development.

### Table Design Notes
- Store transactions, accounts, cards, categories, business, vehicles, house loans, property taxes, fixed payments.
- Add `user_id` to every table.
- Use Supabase RLS to enforce `user_id = auth.uid()`.

### Supabase Strategy
- Keep UI/business logic unchanged by preserving repository interfaces.
- Consider moving balance replay or running balances to database materialized views if transaction volume grows.
- Initial goal is reliability and backup safety, not advanced real-time collaboration.

### Guarded Snapshot Contract
- Every save supplies the revision last observed by the client.
- The database locks the current row and rejects stale revisions with `snapshot_conflict`.
- Successful saves append a new immutable restore point and advance the current revision atomically.
- Local payload hashes ignore only `meta.exportedAt`, allowing the UI to distinguish in-sync and locally changed data.
- A detected newer cloud revision blocks saving until the user refreshes and reviews it.
- A confirmed JSON import or historical restore is blocked before local replacement if its automatic pre-operation restore point encounters a cloud conflict.
- Restore points never overwrite local data directly; they load into import preview first.
- Manual JSON export/import remains available and independent of Supabase.
