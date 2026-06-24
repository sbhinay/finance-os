# Deferred Items

This file tracks important work that is planned, partially started, or intentionally deferred.

FinanceOS is now moving toward a clearer product structure:
- regular mode first: minimal inputs, straightforward cash planning, simple reports
- detailed mode second: richer finance, liability, amortization, and tax insights only when the user opts in

The items below preserve earlier backlog items while regrouping them under the current architecture direction so older planned work is not lost.

## Recently Landed

The following items are no longer purely deferred because they are complete or materially in progress:
- `Health Report` now exists as a warning-first data-quality surface.
- Top-level navigation has been simplified into stronger hub pages:
  - `Daily Log`
  - `Dashboard`
  - `Accounts & Cards`
  - `Assets & Liabilities`
  - `Recurring Payments`
  - `Business`
  - `Data & Health`
- `Transaction History` now lives under `Daily Log`.
- `Projection` now lives under `Dashboard`.
- `Health Report`, `Import / Export`, and `Categories` now live under `Data & Health`.
- Standalone `Overview` and standalone `Property Tax` routes have been removed.
- Parent-owned recurring flows are now materially in place for:
  - account fees
  - card annual fees
  - vehicle insurance
  - property tax
- `Subscriptions` and `Planned Payments` now exist as recurring-domain workflows.
- The mobile shell and core finance views have had a major modernization pass.
- Balance snapshots have replaced the old reconciliation-baseline workflow for account/card balance alignment.
- Account/card snapshot and ledger explanation views are now available for balance diagnosis.
- Credit cards now include `loc` as a supported card/liability type, and LOC draws use `transfer + loc_draw`.
- Category add/edit UI can now mark categories as vehicle-linked or property-linked.
- Vehicle and mortgage backfill now anchor cadence from `nextPaymentDate` when present, so historical generated dates follow the real payment weekday.

The remaining sections below focus on what is still open.

## 1. Recurring Architecture

### High priority
- Continue the redesign of `Fixed Payments` into a shared recurring engine with clearer parent ownership.
- Keep one recurring engine underneath for schedules, next due, backfill, log payment, and dedup logic.
- Reframe the user-facing page over time from a generic fixed-payments list into a clearer recurring dashboard.
- Continue extending asset-originated recurring payment workflows so parent records can launch recurring logic directly.
- Auto-derive `nextPaymentDate` from schedule plus posted history wherever the rules are reliable enough.
- Expand backfill and log-payment behavior consistently across recurring domains.
- Add separate activation / start dates where historical backfill and lifetime cost should differ from the next due date:
  - account fees
  - card annual fees
  - vehicle insurance
  - property tax when needed

### Parent-owned recurring items to deepen further
- Vehicle insurance should continue moving from basic vehicle-owned recurring setup toward richer vehicle-owned modeling.
- Property tax should continue moving from basic house-loan-owned recurring setup toward fuller property-owned modeling.

### First-class recurring domains to deepen
- Expand `Subscriptions`
  - examples: YouTube, Apple, ChatGPT, gym, memberships, recurring car wash plans
  - later: cancellation / renewal metadata, provider detail, and richer insights
- Expand `Planned Payments`
  - examples: TFSA, RRSP, donations, monthly family support, one-off planned commitments, planned savings transfers
  - later: stronger transfer-vs-expense defaults and richer parent metadata

## 2. Property And Liability Model

### Property domain redesign
- Create a stronger `Property` parent model for:
  - primary residence
  - rental property
  - commercial property
- Let property records own related child workflows such as:
  - mortgage / house loan
  - property tax
  - insurance
- Let `Assets & Liabilities` show those property-owned costs more naturally over time instead of leaning on separate legacy tabs.
- Move mortgage workflows from legacy into `Assets & Liabilities` only after the regular-vs-detailed UX is clear enough.
- Continue deepening the new `Assets & Liabilities` page so legacy workflows can move there safely.

### Liability model
- Continue strengthening liability support for loans, LOCs, financed vehicles, and future HELOC-style accounts.
- LOC is now represented as a credit-card-like liability type in the current model, but the long-term model still needs clearer liability/account-kind separation.
- Improve liability-originated payment, interest, and draw workflows without forcing them into misleading income/expense modeling.

## 3. Debt Payment Modeling And Reporting

### Regular vs detailed finance handling
- Implement regular-vs-detailed finance input levels consistently across loans, vehicles, and advanced reports.
- Regular mode should support cash-readiness and payment logging even when detailed finance fields are missing.
- Detailed mode should unlock richer reporting only when the user chooses it and provides more data.

### Mortgage and financed-vehicle refinement
- Improve mortgage and financed-vehicle principal/interest split guidance for detailed reports.
- Keep full payment amounts in projections and cash planning even when only the interest portion is expense-like.
- Improve debt-payment findability without forcing fake normal expense categories onto mortgage and financed-vehicle payments.
- Add better filters and grouping for debt payments in history and reports.

## 4. Transaction History And Findability

### Filtering and lookup
- Redesign `Transaction History` filtering so it does not depend mostly on category.
- Add stronger findability by:
  - type
  - sub-type
  - linked vehicle
  - linked property
  - source account/card
  - tag
  - recurring parent or origin

### Labels and notes
- Auto-generate transaction descriptions by default instead of making users manually write most labels.
- Demote `Notes` to optional secondary metadata instead of giving it equal weight with the main label.
- Improve category presentation so history views show friendly category names, not raw IDs or weak fallback labels.
- Continue extending vehicle/property/category linking so newly created categories can reveal the right linked fields without hardcoded category names.

## 5. AI Statement Scanner

The AI Statement Scanner is planned, not implemented.

### Goal
- Allow the user to upload or photograph bank and credit-card statement screenshots.
- Use an AI vision model to extract candidate transactions.
- Show an editable confirmation table before anything is written.
- Write confirmed rows through the canonical transaction save pipeline.

### Required design constraints
- Do not expose an AI provider API key in browser code.
- Use a server-side API route, Supabase Edge Function, or other secure backend boundary for AI calls.
- Treat scanner output as suggestions until the user confirms.
- Do not create a second direct transaction repository write path.
- Reuse or extract the existing transaction-save pipeline so imports behave like manual entries.
- Show a user-facing privacy notice before sending images to an external AI provider.
- Do not store statement images after processing unless the user explicitly asks for archival support.

### Phase direction
- Phase 1: one image, manual account selection, editable preview, import confirmed rows.
- Phase 2: multi-image batch import, category suggestions from current category list, basic duplicate detection.
- Phase 3: account auto-match from statement hints, fuzzy duplicate detection, confidence indicators.
- Phase 4: correction learning for recurring merchants/categories.

### Open decisions
- Whether Phase 1 should use a purpose-built batch confirmation table or a step-through reuse of `TransactionForm`.
- Where to mount the scanner in navigation: likely `Daily Log` for quick entry and/or `Transaction History` for backfill.
- Which AI provider and model to use after confirming current pricing, privacy, retention, and API capabilities.

## 6. Safe Cloud-First Persistence

### Immediate direction
- Keep current safe manual cloud save + safe restore preview as the baseline.
- Do not reintroduce automatic write-back until stronger protections exist.

### Deferred cloud-first redesign
- Design safe cloud-first persistence using Supabase with:
  - snapshot history
  - overwrite guards
  - conflict protection
  - clearer restore-vs-save intent
- Move toward cloud-first repositories only after those protections exist.
- Make sure manual export/import remains available as a safety and portability tool.

## 7. Reporting, Tax, And Exports

- Add richer import signature validation for current-app exports.
- Add income sources module for expected revenue projections.
- Add tax summary page mapping entries to CRA line items.
- Add Excel/PDF export of reports.
- Improve debt-payment and carrying-cost reporting for properties, financed vehicles, and recurring commitments.

### CRA and filing intelligence
- Continue deepening the new CRA-focused tax review mode so it can explain:
  - which transactions are likely tax-relevant
  - which figures are only bookkeeping totals
  - which CRA form or line a figure may belong to
- Keep the first version warning-first and questionnaire-driven rather than pretending to be filing-ready.
- Start with cautious guidance only:
  - identify likely T2125 business-income and business-expense candidates
  - identify likely HST/GST remittance transactions
  - identify likely home-office, phone, internet, vehicle, and other partial-business-use categories
- Require explicit user inputs before giving stronger filing guidance where needed:
  - province of residence
  - residency status
  - employment income and T-slip context
  - spouse/household context where relevant
  - business-use percentages
  - CCA / capital asset intent
  - GST/HST registration and filing frequency
- Keep the system warning-first:
  - do not present bookkeeping categories as guaranteed CRA filing lines without the required context
  - clearly distinguish:
    - likely mapping
    - user-confirmed mapping
    - accountant-required judgment areas
- Add a future tax review page that can show:
  - proposed CRA line/form mappings
  - missing inputs blocking reliable advice
  - unresolved classification risks
  - exportable tax working papers

## 8. Integrity, QA, And Tooling

- Continue expanding the data health / integrity page for orphaned references and cleanup review.
- Add stronger import review UI for unresolved stale references.
- Complete manual QA on the newer vehicle, property-tax, and asset-launched actions.
- Add a small developer worklog / change-log file in repo for branch and bot traceability.

## 9. UI And Product Modernization

- Continue the visual modernization pass across remaining older surfaces and interactions.
- Keep improving typography, spacing, form density, card layout, and mobile responsiveness.
- Continue reducing old admin-panel feel and make recurring / payment flows feel more guided and modern.
- Keep refining the simplified hub structure:
  - fewer redundant buttons leading to the same place
  - clearer subviews within strong destination pages
  - less duplicated “detail view” navigation
- Continue folding older detail behavior more naturally into:
  - `Accounts & Cards`
  - `Assets & Liabilities`
  - `Recurring Payments`
- Add deeper drill-down from balances, category totals, and report summaries into the underlying transactions.

## Preserved Older Backlog Themes

The following older planned ideas are intentionally still represented above, even if they were regrouped:
- cloud-first save using Supabase
- liability account type for loans and LOCs
- income sources for projections
- tax summary page
- Excel/PDF export
- data health / integrity review
- stronger import review
- mortgage principal/interest guidance
- deeper `Assets & Liabilities` migration
- recurring payment workflows launched from stronger parent records
