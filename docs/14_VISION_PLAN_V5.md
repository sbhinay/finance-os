# FinanceOS Vision Plan v5

## Purpose
This document translates the broader FinanceOS product vision into an implementation-aware plan that fits the current codebase. It keeps the strategic direction of the earlier vision work while reflecting what we have already built and what we learned from real usage.

## Core Product Principles

### 1. Ledger-first system
FinanceOS remains transaction-led.

- Every real money movement should become a transaction.
- Parent records provide setup, scheduling, and context.
- Parent records should never replace ledger history.
- Reports, projections, and audits should always trace back to transactions.

### 2. Regular mode first, detailed mode optional
FinanceOS should help a regular user with minimal required inputs.

Regular mode should answer:
- what came in
- what went out
- what is due next
- will I have enough cash

Detailed mode should unlock richer analysis only when the user asks for it.

Detailed mode can add:
- principal vs interest split
- amortization-aware logic
- richer liability reporting
- deeper tax handling
- higher-confidence projections

Missing detailed fields must never block basic usage.

### 3. Categories for true expense and income meaning
Categories are required for true expense and income rows, but they should not be forced onto transactions where they distort meaning.

- `expense` and `income` should be categorized
- `transfer` should not be forced into fake categories
- `loan_payment` should not be forced into fake categories
- `tax_payment`, `adjustment`, and other system-like flows may remain uncategorized when appropriate

Findability for non-category transactions should come from:
- transaction type
- subtype badge
- linked vehicle/property/liability
- source account/card
- text search

### 4. Warning-first data integrity
FinanceOS should warn about poor data quality but not block basic usage.

Examples:
- uncategorized expense/income
- broken references
- stale schedule state
- ambiguous recurring ownership
- missing detailed debt split

These should surface through:
- Health Report
- inline warnings
- degraded confidence messaging in advanced reports

They should not block:
- normal logging
- simple projections
- normal transaction history browsing

### 5. Parent-owned recurring workflows
Recurring logic should be owned by the strongest parent domain where possible.

Examples:
- account fees belong to accounts
- annual card fees belong to cards
- insurance belongs to vehicles or properties
- property tax belongs to property/house parent
- subscriptions can be first-class recurring records
- planned payments can handle TFSA, RRSP, donations, and family support

The shared recurring engine still powers:
- scheduling
- next due logic
- log payment
- backfill
- recurring dashboard views

### 6. Gradual navigation simplification
The app should converge toward a simpler top-level structure, but not through a forced early rewrite.

The 8-tab target is a gradual convergence, not a near-term hard sprint.

Current direction:
- keep capability
- reduce duplication
- move legacy maintenance pages behind stronger parent pages over time

## Near-Term Information Architecture Direction

### Stronger long-term destinations
- Daily Log
- Dashboard
- Accounts & Cards
- Assets & Liabilities
- Recurring Payments
- Business
- Data & Health

### Transitional reality
Some standalone pages still exist today because:
- parent-owned flows are mid-migration
- legacy workflows remain useful
- recurring redesign is still being folded into stronger destinations

That is acceptable as long as the direction is intentional.

Current active simplification pattern:
- `Transaction History` now sits under `Daily Log`
- `Projection` now sits under `Dashboard`
- `Health Report` and `Import / Export` now sit under `Data & Health`
- `Subscriptions` and `Planned Payments` remain detail views of the shared recurring engine
- `Overview` is now considered weak and should be absorbed rather than restored as a primary tab

## What We Already Learned

### Unsafe automatic cloud sync is not acceptable
Cloud backup and restore work, but automatic overwrite behavior is too risky without:
- snapshot history
- overwrite guards
- conflict detection
- better sync state visibility

Manual cloud save and manual cloud restore with preview remain the current safe approach.

### Debt payments require dual treatment
Mortgage and financed vehicle payments must support two truths:

- cash planning uses the full payment amount
- accounting meaning separates principal from interest when available

This is why debt payments should not be forced into fake normal expense categories.

### Findability matters as much as accounting purity
Users must still be able to find:
- mortgage payments
- financed vehicle payments
- transfers
- property tax
- recurring charges

The answer is better filtering and metadata, not fake categories.

### Balance snapshots are the current alignment model
The old reconciliation-baseline approach caused drift when backdated transactions and mass cleanup work changed history.

The current model is:
- store a known real-world balance directly on the account/card as `balanceSnapshotAmount`
- store the statement/app date as `balanceSnapshotDate`
- replay only later transactions from that anchor
- inspect the ledger explanation when a balance does not match expectation

This keeps balance correction on the account/card record itself instead of spreading it across separate reconciliation rows.

### AI-assisted import is a future input path
Statement scanning is strategically valuable, but it is not a current feature.

The scanner should be treated as a new input path:
- images become candidate rows
- the user reviews and confirms
- confirmed rows use the same transaction-save pipeline as manual entries

It must not become a second ledger-writing system. It also needs a secure backend boundary so API keys and statement images are not handled unsafely in browser-only code.

## Delivery Discipline

### Phase guidance stays, but file rules become flexible
Implementation guidance should remain disciplined, but not unrealistic.

Instead of:
- never touch hooks
- never touch types
- never touch a specific file

we follow:
- prefer smallest safe scope
- justify touching shared logic
- call out risks when changing hooks/types/repositories
- avoid balance-engine rewrites unless truly needed

## Recommended Phase Direction

The stabilization phase has materially landed: balance snapshots, ledger explanations, Health Report, canonical transaction purposes/effects, semantic duplicates, linked lender liabilities, refund treatment, and stronger Transaction History filters are operational.

The ordered path to production completion is now:

1. Complete lender and debt-detail UX.
2. Consolidate recurring architecture.
3. Build the first-class Property parent model. (Landed)
4. Improve optional detailed mortgage/vehicle debt reporting. (Landed)
5. Expand findability, Data Health, and import review. (Landed)
6. Build the secure AI Statement Scanner MVP.
7. Add guarded cloud history and conflict protection.
8. Add tax working papers and Excel/PDF reporting exports.

Every phase must preserve ledger-first behavior, remain backward-compatible with current JSON exports, use accounting `date` rather than `createdAt`, and finish with automated plus browser-level verification.

## Current Implementation Status Summary
As of this version:

- ledger-first transaction model is intact
- recurring ownership now exists across:
  - accounts/cards
  - subscriptions
  - planned payments
  - vehicle insurance
  - house-loan property tax
- cloud backup is manual and safe
- balance snapshots are the current account/card balance-alignment model
- debt payments support regular-first UX
- vehicle/property category linking can be configured from the Categories UI
- vehicle and mortgage backfill use the real next-payment cadence anchor when available
- transaction descriptions are system-first
- transaction history is more subtype/findability aware
- transaction history is now explicitly paginated instead of silently truncating to a hidden cap
- health reporting is live and actionable, not just planned
- canonical transaction persistence and shared financial effects are live
- refunds reverse expense reporting and reduce card owing correctly
- semantic duplicate detection is shared by backfills and Data Health
- linked lender liabilities support borrowing, repayment, and principal-based balances
- lender, account/card, subtype, vehicle, and property history filtering is live
- first-class primary, rental, and commercial Property records are live
- Property details unify linked mortgages, property tax, insurance, expenses, carrying costs, equity, and transaction history
- unambiguous legacy house-loan/property-tax migration is fixture validated
- mortgage and financed-vehicle balances replay explicit principal from their latest snapshots
- debt details separate cash paid, principal, interest, and unsplit payments without guessing
- dashboard, Property equity, net worth, and debt detail views share derived secured-debt owing
- Transaction History supports exact tag and recurring-origin filtering
- Data Health supports canonical correction/relinking, safe deletion, reversible dismissal, and broader orphan/classification checks
- import preview supports transaction relinking, exclusion, normalization acceptance, and semantic-duplicate review before writes
- the June 29 fixture replays all stored account/card balances without drift

The next major challenge is the secure AI Statement Scanner MVP.
