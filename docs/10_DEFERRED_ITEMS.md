# FinanceOS Technical Documentation

## 11. Deferred Items

### High-priority follow-ups
- vehicle history fallback should show category name, not raw category ID
- deepen the new `Assets & Liabilities` page so more legacy workflows can move into it safely
- add asset-originated recurring payment logging workflow similar to fixed payments
- add a small developer worklog / change-log file in repo for branch and bot traceability
- complete a manual QA pass on new vehicle and property-tax actions launched from the unified page
- design safer cloud-first sync with overwrite guards and snapshot history before retrying automation
- implement regular-vs-detailed finance input levels consistently across loans, vehicles, and advanced reports
- move mortgage workflows from legacy into `Assets & Liabilities` only after principal vs interest UX is clear

### Other deferred items
- richer import signature validation for current-app exports
- cloud-first save using Supabase so manual export/import is no longer the only protection against browser/session data loss
- liability account type for loans and lines of credit
- income sources module for expected revenue projections
- tax summary page mapping entries to CRA line items
- Excel/PDF export of reports
- data health / integrity page for orphaned references
- mortgage and financed-vehicle principal/interest split guidance for detailed reports
- stronger import review UI for unresolved stale references
