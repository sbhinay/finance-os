# FinanceOS Mobile And PWA Foundation

FinanceOS now publishes an installable web-app manifest, standalone identity,
theme metadata, safe-area viewport behavior, and shared responsive contracts for
the shell, metrics, forms, and primary transaction modal.

This is a responsive web/PWA foundation, not a native mobile application.

## Intentional Offline Boundary

No service worker or offline write queue is enabled. Financial writes continue to
use the active browser working copy, and cloud snapshots remain explicit and
revision guarded. Offline writes must remain deferred until queued mutations,
cross-device ordering, retries, and conflict resolution are proven end to end.

## Supported Layout Targets

- Desktop: persistent navigation and dense financial work surfaces.
- Tablet: navigation drawer with fluid cards and controls.
- Mobile: single-column forms, touch-sized controls, bottom-sheet transaction
  modal, compact metrics, and horizontally scrollable dense tables where needed.

## Remaining Mobile Work

- Convert remaining page-specific two- and three-column inline grids to shared
  responsive primitives.
- Review every dense ledger and report at 390 px and 768 px.
- Add PNG icon variants and platform-specific install QA before public release.
- Add offline read-only caching only after privacy and stale-data messaging are
  designed; do not cache statement images or exported finance data.
