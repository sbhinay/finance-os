# FinanceOS Technical Documentation

## 9. Business Rules

### Transaction Rules
- `amount` must be greater than 0.
- `sourceId` is required for all transaction types.
- `destinationId` is required for `transfer` and `adjustment`.
- `subType` is required for `transfer`, `tax_payment`, `loan_receipt`, and `loan_payment`.
- `categoryId` is required for `expense` and `income`, optional elsewhere.
- `pending` transactions do not affect balances or reports.
- `cleared` and `reconciled` transactions do affect balances.
- `date` is the accounting/posting date used by replay; `createdAt` is audit metadata and never drives normal balance ordering when `date` exists.
- Custom descriptions remain editable. Stable behavior must use `purpose`, subtype, links, and account identities rather than description text.

### Category Rules
- 24 default categories seeded on first run.
- Categories can be archived; archived categories are hidden from new entry dropdowns.
- Existing transactions remain linked to archived categories.
- `vehicleLinked` enables vehicle/odometer fields in `TransactionForm`.
- `propertyLinked` enables property selector fields.
- The Categories UI can set `vehicleLinked` and `propertyLinked` for new or existing categories.
- Category names alone do not trigger vehicle/property fields; the explicit flags do.

### Primary Item Rules
- Accounts and cards can be marked primary.
- Primary items are sorted first in dropdowns.
- Multiple primaries are allowed across domains.
- Source option sorting is handled by `buildSourceOptions()` in `utils/finance.ts`.

### Recurring Payment Rules
- `startDate` is the stable first-known occurrence and historical backfill anchor.
- `date` is the next due date and advances from the actual confirmed/logged accounting date.
- `shiftOneInterval()` is the shared forward/backward cadence rule for pending generation, Log Payment, confirmation, and backfill.
- Monthly advances by calendar month, preserves month-end schedules, and never uses a fixed 30-day approximation.
- Annual advances by calendar year and clamps leap-day schedules safely.
- One-time payments do not auto-advance.
- Overdue and due fixed payments surface in the Daily Log pending banner.
- Recurring items may now carry a `kind` so one shared engine can power:
  - general recurring items
  - subscriptions
  - utilities
  - insurance
  - property tax
  - planned payments
  - account fees
  - card fees
- Parent-owned recurring rows should be auto-created from their parent records when that parent owns the schedule data.
- Parent-owned rows are edited through their parent and cannot be independently deleted from the recurring hub.
- Posted recurring transactions store `recurringOriginType` and `recurringOriginId`; legacy rows remain valid without those optional fields.
- Unused recurring definitions may be deleted. Definitions with posted transactions are archived so historical origin links remain valid.
- All recurring backfill batches use `persistCanonicalTransactions()`; direct repository transaction writes are prohibited.
- `Planned Payments` must behave by record-declared posting type rather than page-level hardcoded assumptions.
- `Recurring Payments` is the primary recurring hub; `Subscriptions` and `Planned Payments` are focused views over the same shared engine, not separate scheduling engines.

### Asset Payment Rules
- Vehicle and house loan `nextPaymentDate` advance by schedule after confirmation.
- `Vehicle.source` and `HouseLoan.source` should store account IDs.
- Asset payment tracking should preserve linked transaction relationships.
- New asset-originated actions should open the shared `TransactionForm` when they create real ledger rows.
- Legacy mortgage editing must tolerate stale saved source IDs and allow users to re-select a current account.
- Mortgage backfill should generate missing historical scheduled payments but skip dates that already have matching ledger rows.
- Vehicle and mortgage backfill should use `nextPaymentDate` as the cadence anchor when present. Start dates act as historical lower bounds, not necessarily as the recurring weekday anchor.
- Vehicle parent records may also own recurring insurance setup.
- House-loan/property parent records may also own recurring property-tax setup during the transition away from a standalone property-tax-only model.
- A lease payment is `expense` + `vehicle_lease_payment` + `Vehicle Lease` category + `linkedVehicleId`.
- Manual logging, Log Payment, pending confirmation, and backfill use the same canonical naming and classification rules.
- Duplicate prevention and Data Health both use the same semantic comparator and do not rely on descriptions.

### Regular vs Detailed Rules
- Regular mode must ask only for the minimum needed to answer cash-flow questions like what came in, what went out, what is due next, and whether the account will be ready.
- Detailed mode may ask for extra fields only when the user wants richer reporting, tax treatment, or financing analysis.
- Missing advanced financing details must never block standard logging, planning, or basic projection.

### Loan and Financing Rules
- Mortgage payments, financed vehicle payments, and other debt payments should use the full cash payment amount for readiness and projection.
- Only the interest portion of a mortgage or financed debt payment is expense-like; principal reduces liability and is not generic spending.
- Lease payments are closer to ordinary recurring outflows and may remain expense-like unless a more specialized model is added.
- `loan_payment` rows keep optional `principalAmount` and `interestAmount` for backward-compatible manual overrides, statement-confirmed rows, and imports.
- Normal mortgage logging and backfill must not store app-generated estimated split fields.
- Mortgage/Debt Details may dynamically estimate principal and interest from snapshot, rate, schedule, and payment history; calculated values must be labeled as Estimated.
- Stored non-generated split rows must be labeled as Manual in detailed views.
- Mortgage rows use `linkedHouseLoanId` for exact debt ownership; legacy rows migrate only from a valid house-loan origin or a Property with exactly one mortgage.
- Mortgage and financed-vehicle owing is derived from the latest balance snapshot plus later manual or dynamically estimated principal reductions when enough loan data exists.
- Unsplit secured-debt payments remain full cash outflows; they reduce derived owing only when a manual split or dynamic estimate is available.
- Explicit interest is included in expense reporting; principal is excluded from expense totals.
- Transaction History tag and recurring-origin filters operate on stored metadata, not description text.
- Data Health may dismiss legitimate non-blocking warnings, but dismissals are reversible and never mutate ledger rows.
- Import review must keep all changes in preview state until confirmation; relinking and row exclusion cannot write to the active ledger early.
- Import duplicate review uses semantic identity rather than matching descriptions.
- `transfer + loc_draw` is the canonical way to represent borrowed cash moving from a line of credit into a receiving account.
- Personal, bank, and shareholder lenders are represented by `Liability` records.
- Multiple receipts may link to one lender liability and increase its amount owed.
- Repayments decrease liability by `principalAmount`, or by the full amount when no split is supplied.
- Interest reduces the paying account but does not reduce liability principal.
- Loan receipt `sourceId` identifies the receiving cash account; loan payment `sourceId` identifies the paying cash account. `linkedLiabilityId` identifies the lender.
- A lender snapshot is valid only when both `balanceSnapshotAmount` and `balanceSnapshotDate` exist.
- Lender activity on or before the snapshot date is already represented by the snapshot; only later principal activity is replayed.
- Lenders with linked transactions are archived instead of deleted. Lenders without linked transactions may be deleted.
- Relinking a loan row must pass through the canonical transaction pipeline so validation, persistence, balances, and events remain synchronized.

### Balance Snapshot Rules
- Known real-world balances are stored on accounts, cards, and lender liabilities using `balanceSnapshotAmount` and `balanceSnapshotDate`.
- Snapshot entry is the current statement-alignment action.
- Transactions on or before the snapshot date are treated as already included in the snapshot for that account/card.
- Transactions after the snapshot date are replayed from the snapshot amount.
- Legacy reconciliation adjustment rows should not be used for new balance alignment and are skipped by replay.

### Reporting Rules
- Only `expense` and `refund` are included in expense reporting; refunds subtract from their original category.
- Only `income` and `dividend` are included in income reporting.
- `transfer` rows, including `cc_payment`, are excluded from standard income/expense summaries unless explicitly included.
- `tax_payment`, `adjustment`, `loan_payment`, and `withdrawal` are also excluded from standard income/expense summaries unless explicitly included.
- Regular projections must include full scheduled outflows for mortgages, vehicle payments, fixed payments, and CRA obligations even when those rows are not standard expense types.
- Detailed financing reports may later use `principalAmount`, `interestAmount`, rate, amortization, and term data when available, but regular projections must not depend on them.
- Subscription rows should default to `Subscriptions` category when that category exists in the dedicated subscription workflow.
- Transaction History is explicitly paginated for usability; exports still operate on the full filtered result set rather than only the visible page.
- List signs and colors use shared transaction semantics: refunds and loan receipts are positive, ordinary outflows are negative, and transfers remain neutral in generic history.

### Navigation Rules
- Top-level navigation should prefer a small number of strong hubs over many sibling utility tabs.
- Secondary/detail pages may still exist during transition, but they should be reached from parent hub views whenever practical.
- `Overview` is no longer treated as a strong primary destination and should be folded into `Dashboard` and `Accounts & Cards` over time.
