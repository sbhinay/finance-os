# Deferred Items

This file tracks work that still needs product hardening after real-user testing. Landed behavior belongs in the technical documents; unfinished or confusing behavior stays here until it is verified from the browser and user workflow.

## Delivery Discipline

Work must proceed in controlled visible slices:

- Do one visible slice at a time.
- Keep the app usable at the end of every slice.
- After each slice, stop and report exactly what changed.
- Tell the user what to test in the browser.
- Do not continue to the next slice until the user confirms.
- Commit and sync `main` and `codex/phase-next` only after the slice is verified.

## Recently Landed Foundations

These items are implemented enough to serve as foundations, but some still need polish in the remaining slices below:

- Canonical transaction persistence through `services/transactionPipeline.ts`.
- Shared transaction purposes and financial-effect semantics.
- Refund treatment that reduces card owing and reverses expense reporting.
- Balance snapshots on accounts, cards, and debt-like records.
- Account/card ledger explanation views.
- Lender liability tracking foundation with Borrow and Repay workflows.
- Semantic duplicate detection.
- First-class Property records and linked mortgage/property-tax relationships.
- Data Health repair actions and import-preview cleanup controls.
- Guarded Supabase snapshot foundation.
- Incremental modern UI passes across the shell, Daily Log, Transaction History, Dashboard, Accounts & Cards, Business, Data & Health, Categories, Hours & Contracts, Scan Statement, and Properties.

## Remaining Controlled Slices

### 1. Lender UX Completion

- Polish lender create/edit/detail workflows.
- Confirm archive, restore, and safe deletion behavior from the browser.
- Improve lender detail layout, notes, snapshots, relinking, and running ledger clarity.
- Make borrowed, principal repaid, interest paid, and current owing easy to trust.

### 2. Assets, Liabilities, House Loans, and Vehicles Cleanup

- Make Assets & Liabilities, House Loans, Properties, and Vehicles feel like one connected area.
- Reduce confusing duplicate entry points without hiding needed links.
- Clarify which records are parents, which records are ledger transactions, and which views are reports.
- Keep mortgage and vehicle actions discoverable from the unified hub.

### 3. Mortgage Principal and Interest Strategy

- Avoid fragile app-generated stored principal/interest fields.
- Prefer dynamic estimated splits in detail/report views when rate, balance, cadence, and snapshot data are available.
- Preserve statement-confirmed or deliberately entered manual splits only when clearly intentional.
- Support lump-sum principal payments without corrupting future calculations.
- Keep full payments in cash planning while reducing debt only by principal.

### 4. Projection Logic for CC and LOC Repayments

- Include expected credit-card repayment pressure.
- Include expected LOC repayment pressure.
- Separate planned payments already logged from unplanned repayment exposure.
- Keep projections realistic instead of falsely positive when card/LOC obligations are unpaid.

### 5. Recurring Architecture Consolidation

- Ensure confirmations, backfills, Log Payment, schedules, and parent-owned recurring flows use one shared write path.
- Preserve canonical transaction purposes and semantic duplicate detection.
- Standardize ownership links and recurring-origin links.
- Remove redundant transaction-writing paths only where safe and well-tested.

### 6. Property Model Polish

- Unify Properties, House Loans, property tax, insurance, mortgages, and property expenses in the user flow.
- Make ownership and reporting clear for primary, rental, and commercial properties.
- Improve property carrying-cost, equity, and linked transaction explanations.

### 7. Data Health Expansion

- Improve cleanup, relink, delete, correct, and dismiss controls.
- Expand duplicate, stale-reference, orphan, and classification checks.
- Make legitimate duplicates dismissible without hiding future real issues.

### 8. Import Review Improvements

- Improve warning language and cleanup previews.
- Make relinking, exclusion, duplicate review, and normalization acceptance easier before import confirmation.
- Preserve backward-compatible JSON import/export.

### 9. Tax Working Papers and Exports

- Add or harden Excel and PDF exports for useful reports.
- Keep CRA mapping cautious and confidence-based.
- Separate bookkeeping totals from user-confirmed tax treatment.
- Include lender, debt, property, vehicle, business, and ledger summaries.

### 10. Guarded Cloud History and Conflict Protection

- Expand snapshot history and restore points.
- Improve overwrite protection and conflict/version checks.
- Make local-versus-cloud state clear.
- Preserve manual JSON export/import as the independent safety path.

### 11. AI Statement Scanner Deferred

- Keep the scanner documented but deferred until the core app is solid.
- Do not prioritize OCR/provider work ahead of ledger, projection, debt, and UI stability.

### 12. Larger Visual System Modernization

- Continue improving typography, spacing, modal structure, page consistency, and subtle motion.
- Make dense finance pages feel modern without reducing scanability.
- Continue removing older inline-heavy styling from remaining screens.

### 13. Transaction History Summary Clarity

Observed July 2026: Transaction History showed `Outflows` above 10K while the `Expense` filter showed about 7K. This is confusing because the summary includes non-expense cash outflows such as debt, tax, card, LOC, or principal repayment rows, while the `Expense` filter only shows rows typed as expenses.

- Initial slice landed: Transaction History now labels filtered outflows, adds a Tax filter, and shows an Outflow Breakdown panel for expense, debt repayment, tax payment, and other cash-out rows.
- Break down Outflows into Expense, Debt Repayment, Tax, and other cash-out categories.
- When a type filter is active, make it clear that summary cards are filtered totals.
- Add drilldown, chips, or clearer labels so the user can identify which non-expense rows make up the difference.
- Ensure principal repayments remain cash outflows but are not mislabeled as expenses.

## Non-Negotiable Architecture Rules

- Transaction `date` is the accounting date; `createdAt` is metadata and a same-day tie-breaker only.
- All transaction persistence goes through `services/transactionPipeline.ts`.
- Balance snapshots are stored on the account, card, or debt record; no reconciliation adjustment rows are created.
- Shared transaction semantics determine balances, signs, colors, ledgers, and reports.
- Imports remain backward-compatible and migrate only unambiguous meaning.
- Custom descriptions and user-managed categories are preserved.
- Touched files must pass mojibake validation before commit.
