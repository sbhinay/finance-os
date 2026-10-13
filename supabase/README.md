# FinanceOS Supabase Phase 1

This folder holds the first cloud-save scaffolding for FinanceOS.

## Goal
- Move from browser-only persistence to authenticated cloud persistence.
- Keep the existing repository-driven app architecture.
- Start with single-user reliability and phone-accessible web usage before broader commercial concerns.

## First setup steps
1. In Supabase SQL Editor, run `01_phase1_schema.sql`.
2. Run `02_guarded_snapshots.sql` to create revisioned snapshot history and the guarded save RPC.
   Then run `03_snapshot_history_retention.sql` to bound history: it keeps the 20 most recent revisions,
   the last revision of each day for 30 days, and pre-operation restore points for 30 days, and prunes
   older history once when it is applied.
3. In the app root, create `.env.local` from `.env.example`.
4. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. Add email/password auth in Supabase Auth settings.
6. Keep JSON export/import as backup even after cloud snapshots are enabled.

## Important safety note
- Do not commit service-role keys.
- Do not put the direct Postgres password into client-side code.
- The publishable key is safe for browser use when combined with Row Level Security.
- Snapshot tables are client-read-only. Writes go through `save_app_snapshot_guarded`, which rejects stale revisions and appends a restore point. History is pruned by the retention trigger; the live snapshot is never pruned.
- Applying SQL migrations or deploying the app remains an explicit external operation; neither happens automatically from the client.
