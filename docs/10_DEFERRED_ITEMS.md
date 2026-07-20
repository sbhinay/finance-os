# Deferred Items

This file records work that remains after the eight-phase production-completion program. Landed behavior belongs in the technical documents; this file must not describe shipped features as future work.

## Landed Production Phases

### Phase 1: Lender and debt UX
- Lender create/edit, notes, archive/restore, safe deletion, snapshots, canonical relinking, Borrow, and Repay are implemented.
- Lender detail reports borrowed, principal repaid, interest paid, current owing, and a running principal ledger.

### Phase 2: Recurring architecture
- Pending generation, confirmation, Log Payment, and backfill use shared canonical transaction rules.
- Recurring definitions have stable ownership and origin links.
- Subscriptions, planned transfers, fees, insurance, property tax, vehicle payments, mortgages, and tax obligations use the canonical write path.

### Phase 3: Property parent model
- First-class primary, rental, and commercial Property records are implemented.
- Properties link mortgages, property tax, insurance, expenses, carrying costs, equity, and transaction history.
- Only unambiguous legacy relationships migrate automatically.

### Phase 4: Detailed debt reporting
- Mortgage details separate cash paid, principal, interest, and unallocated payments.
- Mortgage principal/interest is calculated dynamically when rate/snapshot data is available, with rows labeled Estimated versus Manual.
- Stored split fields remain only for backward-compatible manual overrides, imports, or statement-confirmed exception rows.
- Full payments remain in cash planning; manual or dynamically estimated principal reduces derived mortgage liability.
- Regular mode remains valid when a split is unavailable.

### Phase 5: Findability and Data Health
- Transaction History supports account/card, subtype, linked entity, tag, and recurring-origin filters.
- Data Health checks stale references, classifications, debt splits, recurring ownership, and semantic duplicates.
- Users can correct, relink, delete, or dismiss findings safely.
- Import preview supports relinking, row exclusion, cleanup acceptance, and duplicate review.

### Phase 6: AI Statement Scanner MVP
- The scanner uses a server-only, replaceable provider adapter.
- Images produce editable candidates and require explicit account/card selection.
- Nothing is written before confirmation; confirmed rows use canonical batch persistence.
- Privacy, retention, request limits, and duplicate review are visible to the user.

### Phase 7: Guarded cloud persistence
- Cloud saves use optimistic revision checks and append-only restore history.
- Stale overwrites are blocked and local-versus-cloud state is visible.
- Restores enter import preview; JSON export/import remains independent.
- Required Supabase migration and deployment documentation is included.

### Phase 8: Tax and reporting exports
- CRA working papers keep bookkeeping totals separate from proposed or user-confirmed tax treatment.
- Missing-information and accountant-review states remain explicit.
- Excel and PDF exports cover tax, business, lender, debt, Property, vehicle, and ledger summaries.

## Remaining External Acceptance Work

These are environment or external-service checks, not missing local implementations:

- Run one live AI extraction after a server-side provider credential is supplied.

Browser acceptance is complete at desktop and mobile breakpoints for lender, Property, recurring, Data Health, scanner, cloud, and tax/report surfaces. No browser console errors were observed.

The guarded Supabase migration is deployed. Read-only verification confirmed the upgraded `app_snapshots` table, append-only `app_snapshot_history` table, and an authentication-protected `save_app_snapshot_guarded` RPC.

## Deferred Product Enhancements

### Finance depth
- Add optional amortization schedule generation and statement-assisted principal/interest allocation.
- Add richer LOC and HELOC facilities beyond the current credit-card-like liability representation.
- Add lender statements, payoff projections, and multi-currency debt support.
- Add rental-property income, occupancy, tenant, and capital-improvement workflows.

### Recurring intelligence
- Add renewal/cancellation metadata and merchant insights for subscriptions.
- Add richer expected-income sources and scenario-aware planned transfers.
- Add optional matching assistance for schedule rows that differ from posted bank dates or amounts.

### Scanner evolution
- Add provider benchmarking, account auto-detection, PDF statement support, and correction learning.
- Add optional user-controlled archival only after privacy, encryption, and retention design is approved.

### Cloud evolution
- Consider cloud-first repositories only after guarded snapshots have been deployed and observed safely.
- Add multi-device merge support only with an explicit, testable conflict policy.

### Tax evolution
- Expand CRA mappings only where current guidance and required taxpayer context support them.
- Add accountant handoff packages and year-end comparative working papers.
- Do not present bookkeeping classifications as filing advice.

### Product and QA
- Continue accessibility, responsive-layout, performance, and browser-compatibility testing.
- Add broader end-to-end coverage when the browser automation runtime is restored.
- Continue visual modernization without weakening dense operational workflows.

## Non-Negotiable Architecture Rules

- Transaction `date` is the accounting date; `createdAt` is metadata and a same-day tie-breaker only.
- All transaction persistence goes through `services/transactionPipeline.ts`.
- Balance snapshots are stored on the account/card/debt record; no reconciliation adjustment rows are created.
- Shared transaction semantics determine balances, signs, colors, ledgers, and reports.
- Imports remain backward compatible and migrate only unambiguous meaning.
- Custom descriptions and user-managed categories are preserved.
