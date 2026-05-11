# Deferred Items

This file tracks important work that is planned, partially started, or intentionally deferred.

FinanceOS is now moving toward a clearer product structure:
- regular mode first: minimal inputs, straightforward cash planning, simple reports
- detailed mode second: richer finance, liability, amortization, and tax insights only when the user opts in

The items below preserve earlier backlog items while regrouping them under the current architecture direction so older planned work is not lost.

## 1. Recurring Architecture

### High priority
- Redesign `Fixed Payments` into a shared recurring engine with clearer parent ownership.
- Keep one recurring engine underneath for schedules, next due, backfill, log payment, and dedup logic.
- Reframe the user-facing page over time from a generic fixed-payments list into a clearer recurring dashboard.
- Add asset-originated recurring payment workflows so parent records can launch recurring logic directly.
- Auto-derive `nextPaymentDate` from schedule plus posted history wherever the rules are reliable enough.
- Expand backfill and log-payment behavior consistently across recurring domains.

### Parent-owned recurring items to move out of generic fixed payments
- Account fees should be owned by bank-account records.
- Credit-card annual fees should be owned by credit-card records.
- Subscriptions should become a first-class domain instead of living only as generic fixed payments.
- Insurance should become a stronger recurring domain instead of being mixed into generic fixed payments.
- Property tax should become a child workflow of a property record instead of a permanently separate top-level concept.

### First-class recurring domains to add
- `Subscriptions`
  - examples: YouTube, Apple, ChatGPT, gym, memberships, recurring car wash plans
- `Planned Payments`
  - examples: TFSA, RRSP, donations, monthly family support, one-off planned commitments, planned savings transfers

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
- Move mortgage workflows from legacy into `Assets & Liabilities` only after the regular-vs-detailed UX is clear enough.
- Continue deepening the new `Assets & Liabilities` page so legacy workflows can move there safely.

### Liability model
- Add stronger liability account support for loans and lines of credit.
- Reduce ambiguity between liabilities that behave like cards, loans, LOCs, and financed assets.
- Improve liability-originated payment and draw workflows without forcing them into misleading income/expense modeling.

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

## 5. Safe Cloud-First Persistence

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

## 6. Reporting, Tax, And Exports

- Add richer import signature validation for current-app exports.
- Add income sources module for expected revenue projections.
- Add tax summary page mapping entries to CRA line items.
- Add Excel/PDF export of reports.
- Improve debt-payment and carrying-cost reporting for properties, financed vehicles, and recurring commitments.

## 7. Integrity, QA, And Tooling

- Add a data health / integrity page for orphaned references and cleanup review.
- Add stronger import review UI for unresolved stale references.
- Complete manual QA on the newer vehicle, property-tax, and asset-launched actions.
- Add a small developer worklog / change-log file in repo for branch and bot traceability.

## 8. UI And Product Modernization

- Modernize the overall visual system after the structural model is more stable.
- Improve typography, spacing, form density, card layout, and mobile responsiveness.
- Reduce old admin-panel feel and make recurring / payment flows feel more guided and modern.

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
