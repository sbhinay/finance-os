# FinanceOS - Technical Documentation
**Version:** 3.0
**Last Updated:** June 2026
**Status:** Active Development

---

## Table of Contents
1. [Vision & Purpose](01_VISION_AND_STACK.md)
2. [Technology Stack](01_VISION_AND_STACK.md)
3. [Project Structure](02_PROJECT_STRUCTURE.md)
4. [Architecture Overview](03_ARCHITECTURE.md)
5. [Data Model](04_DATA_MODEL.md)
6. [Storage Keys & Transaction System](05_STORAGE_AND_TRANSACTIONS.md)
7. [Balance Architecture & Events](06_BALANCE_AND_EVENTS.md)
8. [Repositories & Modules](07_REPOSITORIES_AND_MODULES.md)
9. [Business Rules](08_BUSINESS_RULES.md)
10. [Import / Export & Dates](09_IMPORT_EXPORT_AND_DATES.md)
11. [Deferred Items](10_DEFERRED_ITEMS.md)
12. [Cloud Migration](11_CLOUD_MIGRATION.md)
13. [Commercial Vision](12_COMMERCIAL_VISION.md)
14. [Appendices](13_APPENDICES.md)
15. [Vision Plan v5](14_VISION_PLAN_V5.md)
16. [AI Statement Scanner](15_AI_STATEMENT_SCANNER.md)

---

## 1. Vision & Purpose
FinanceOS is a personal financial operating system for Canadian contractors, salaried employees, and incorporated business owners. Its core mission is to provide a single ledger-based financial record, reconcile balances reliably, and support tax-aware decision making.

## 2. Key Current Features
- Master transaction ledger with replay-based balance computation.
- Canonical transaction purposes and one shared financial-effect implementation across balances, ledgers, history, and reports.
- Full support for bank accounts, credit cards, first-class Properties, assets, liabilities, and recurring payments.
- Current-app JSON export/import with asset restoration.
- Balance snapshots on accounts and credit cards.
- Business and CRA support for HST, corporate tax, and payroll remittance tracking.
- New `CRA Review` business subview that combines current ledger and business data with saved tax questionnaire inputs to produce warning-first CRA working-paper guidance.
- Initial unified `Assets & Liabilities` page with upcoming-obligation actions.
- Parent-owned recurring workflows for:
  - bank-account fees
  - credit-card annual fees
  - vehicle insurance
  - property insurance and property tax
- Dedicated recurring views for:
  - `Subscriptions`
  - `Planned Payments`

## 3. Current Implementation Notes
- Internal money movement is standardized on `transfer`; credit card payoff is stored as `transfer` with `subType: "cc_payment"`.
- LOC drawdowns are moving toward `transfer` with `subType: "loc_draw"` instead of being treated like income.
- Accounts and credit cards support `balanceSnapshotAmount` and `balanceSnapshotDate`.
- `recalculateBalances.ts` bases replay on the latest balance snapshot when present and avoids compound drift.
- Legacy reconciliation adjustment rows are ignored by balance replay and should be treated as old cleanup/audit data, not the current balance workflow.
- The new `Assets & Liabilities` area is now in active transition, not just planned. It already surfaces upcoming obligations and launches selected actions through the canonical `TransactionForm`.
- Legacy `House Loans / Mortgages` now supports direct mortgage logging and backfill for missed historical scheduled payments.
- Recurring payments now use one canonical engine for pending generation, confirmation, Log Payment, fixed/vehicle/mortgage backfill, semantic duplicate handling, origin links, and safe archive behavior.
- Recurring definitions separate stable historical `startDate` from advancing next-due `date`, and calendar cadence preserves month-end and annual dates.
- Parent-owned recurring rows are visibly parent managed and cannot be independently edited or deleted.
- `Subscriptions` and `Planned Payments` are now first-class recurring views.
- Planned payments are record-driven rather than hardcoded: each planned item declares whether it posts as an `expense` or a `transfer`.
- Vehicle insurance is now owned by the vehicle parent record and auto-creates its recurring item behind the scenes.
- First-class Properties now own linked mortgages, property tax, insurance, expenses, carrying-cost history, equity, and transaction drill-down.
- Legacy house loans and standalone property-tax records migrate only through unambiguous matches; current JSON and cloud payloads preserve Property relationships.
- Import validation now checks stale references more strictly and falls back to `Other` for ambiguous category mappings instead of guessing.
- Automatic Supabase write-back was rolled back; cloud behavior is currently safe manual save + safe manual restore preview.
- Projection logic already uses full scheduled vehicle and house-loan payment amounts for cash planning rather than relying only on generic expense rows.
- Transaction descriptions are now system-first and notes are secondary/collapsed instead of equally prominent.
- Transaction History is no longer category-only for findability; it now supports richer debt-oriented lookup and subtype-aware display.
- Transaction History is now explicitly paginated with user-visible page controls instead of silently clipping to a hidden row limit.
- Health Report is now live as a warning-first repair surface rather than a deferred concept.
- Account and credit-card balance snapshots can be set directly from the account/card record and inspected through ledger views.
- Assets & Liabilities now supports full lender management: edit/notes, snapshots, archive/restore, safe deletion, linked borrowing and repayment, canonical relinking, principal/interest summaries, and a running debt ledger.
- Lender snapshots use a known owing amount/date as the replay anchor; later repayments reduce owing only by principal while interest remains separately reported.
- Mortgage and financed-vehicle snapshots now use the same conservative principal-only replay contract.
- Debt details separate cash paid, principal, interest, unallocated payments, and current owing; dashboard, Property equity, and net-worth views consume the same calculation.
- `linkedHouseLoanId` provides exact mortgage ownership, with only unambiguous legacy linkage migrated.
- Transaction History now filters by tag and exact recurring origin.
- Data Health can open the canonical transaction editor for correction/relinking, delete rows safely, and reversibly dismiss legitimate warnings.
- Import preview supports source/destination relinking, row exclusion, semantic-duplicate review, and explicit normalization acceptance without touching active data before confirmation.
- AI Statement Scanner uses a server-only provider adapter, editable candidate preview, explicit account/card selection, semantic duplicate review, and canonical batch confirmation.
- Scanner images are request-memory only in FinanceOS; privacy consent and provider-retention messaging are shown before extraction.
- Supabase cloud saves now use optimistic revision checks, append-only restore history, conflict blocking, and visible local-versus-cloud comparison.
- Cloud snapshot tables are client-read-only; every restore enters import preview and manual JSON backup remains available.
- Refunds reverse expense reporting and reduce credit-card owing without being treated as income.
- Paid invoices now create linked `invoice_deposit` ledger rows; legacy virtual deposits remain compatible during migration.
- Transaction History financial summaries distinguish general inflows from taxable income, so borrowing is visible without inflating income reporting.
- Production Phases 1 through 7 are landed. The active roadmap now proceeds through tax working papers and report exports.
- Categories now support `vehicleLinked` and `propertyLinked` flags from the Categories UI so new vehicle/property categories can reveal the correct transaction fields.
- Vehicle and mortgage backfill uses `nextPaymentDate` as the schedule anchor when available, so historical backfill follows the real payment weekday/cadence instead of blindly anchoring to the start date.
- The sidebar has been simplified around seven hubs:
  - `Daily Log`
  - `Dashboard`
  - `Accounts & Cards`
  - `Assets & Liabilities`
  - `Recurring Payments`
  - `Business`
  - `Data & Health`
- Secondary pages remain available, but they are increasingly treated as subviews under those stronger destinations.
- The current UX modernization uses a shared theme/token layer in `lib/theme.ts` rather than a UI framework migration.
- Mobile navigation now uses an off-canvas drawer so narrow screens are not dominated by the sidebar.
- Dashboard, Daily Log, Transaction History, Assets, and Recurring surfaces are in active visual refresh so desktop and phone layouts stay usable from the same code path.
- The `Business` hub now separates:
  - operational business tracking
  - corporation income snapshots
  - CRA review and missing-input guidance
  - tax obligations
  - tax/rate settings

## 4. Documentation Structure
The docs are organized into the following cross-linked files:
- `01_VISION_AND_STACK.md`
- `02_PROJECT_STRUCTURE.md`
- `03_ARCHITECTURE.md`
- `04_DATA_MODEL.md`
- `05_STORAGE_AND_TRANSACTIONS.md`
- `06_BALANCE_AND_EVENTS.md`
- `07_REPOSITORIES_AND_MODULES.md`
- `08_BUSINESS_RULES.md`
- `09_IMPORT_EXPORT_AND_DATES.md`
- `10_DEFERRED_ITEMS.md`
- `11_CLOUD_MIGRATION.md`
- `12_COMMERCIAL_VISION.md`
- `13_APPENDICES.md`
- `14_VISION_PLAN_V5.md`
- `15_AI_STATEMENT_SCANNER.md`

## 5. Notes for Review
- The documentation prefers current code behavior over legacy wording.
- Where implementation is not fully complete, deferred items are explicitly listed.
- This set is a v3 refresh of the repo docs.
- Some documents have been refreshed after the June 2026 balance snapshot and category-linking work; older references to reconciliation baselines should be considered obsolete.
- Cloud save is now an active planned direction using Supabase rather than a speculative future-only idea.
- FinanceOS is moving toward a two-level product model: regular cash-first workflows first, detailed finance and tax workflows only when the user opts in.
- The current navigation now deliberately emphasizes a reduced hub set while still preserving older detail pages behind sub-navigation during transition.

