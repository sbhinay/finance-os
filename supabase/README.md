# FinanceOS Supabase Phase 1

This folder holds the first cloud-save scaffolding for FinanceOS.

## Goal
- Move from browser-only persistence to authenticated cloud persistence.
- Keep the existing repository-driven app architecture.
- Start with single-user reliability and phone-accessible web usage before broader commercial concerns.

## First setup steps
1. In Supabase SQL Editor, run `01_phase1_schema.sql`.
2. In the app root, create `.env.local` from `.env.example`.
3. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Add email/password auth in Supabase Auth settings.
5. Keep JSON export/import as backup until repository migration is complete.

## Important safety note
- Do not commit service-role keys.
- Do not put the direct Postgres password into client-side code.
- The publishable key is safe for browser use when combined with Row Level Security.
