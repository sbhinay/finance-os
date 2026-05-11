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

### Category Rules
- 24 default categories seeded on first run.
- Categories can be archived; archived categories are hidden from new entry dropdowns.
- Existing transactions remain linked to archived categories.
- `vehicleLinked` enables vehicle/odometer fields in `TransactionForm`.
- `propertyLinked` enables property selector fields.

### Primary Item Rules
- Accounts and cards can be marked primary.
- Primary items are sorted first in dropdowns.
- Multiple primaries are allowed across domains.
- Source option sorting is handled by `buildSourceOptions()` in `utils/finance.ts`.

### Fixed Payment Rules
- The `date` field is the recurring anchor.
- `advanceOneInterval()` advances fixed payments after a logged payment.
- Monthly advances by calendar month, not fixed days.
- Annual advances by calendar year.
- One-time payments do not auto-advance.
- Overdue and due fixed payments surface in the Daily Log pending banner.

### Asset Payment Rules
- Vehicle and house loan `nextPaymentDate` advance by schedule after confirmation.
- `Vehicle.source` and `HouseLoan.source` should store account IDs.
- Asset payment tracking should preserve linked transaction relationships.
- New asset-originated actions should open the shared `TransactionForm` when they create real ledger rows.
- Legacy mortgage editing must tolerate stale saved source IDs and allow users to re-select a current account.
- Mortgage backfill should generate missing historical scheduled payments but skip dates that already have matching ledger rows.

### Regular vs Detailed Rules
- Regular mode must ask only for the minimum needed to answer cash-flow questions like what came in, what went out, what is due next, and whether the account will be ready.
- Detailed mode may ask for extra fields only when the user wants richer reporting, tax treatment, or financing analysis.
- Missing advanced financing details must never block standard logging, planning, or basic projection.

### Loan and Financing Rules
- Mortgage payments, financed vehicle payments, and other debt payments should use the full cash payment amount for readiness and projection.
- Only the interest portion of a mortgage or financed debt payment is expense-like; principal reduces liability and is not generic spending.
- Lease payments are closer to ordinary recurring outflows and may remain expense-like unless a more specialized model is added.
- `loan_payment` rows should support optional `principalAmount` and `interestAmount`, but regular mode must still work if the split is unknown.
- `transfer + loc_draw` is the canonical way to represent borrowed cash moving from a line of credit into a receiving account.

### Reconciliation Rules
- Reconcile metadata is stored on accounts/cards using `balanceBase`, `reconciledBalance`, and `reconciledDate`.
- Reconciliation audit rows are stored as `type: "adjustment"` with `subType: "reconciliation"`.
- Audit entries are excluded from normal reporting views.
- Reconcile is a statement-alignment action, not a generic income/expense logging flow.

### Reporting Rules
- Only `expense` and `refund` are included in expense reporting.
- Only `income` and `dividend` are included in income reporting.
- `transfer` rows, including `cc_payment`, are excluded from standard income/expense summaries unless explicitly included.
- `tax_payment`, `adjustment`, `loan_payment`, and `withdrawal` are also excluded from standard income/expense summaries unless explicitly included.
- Regular projections must include full scheduled outflows for mortgages, vehicle payments, fixed payments, and CRA obligations even when those rows are not standard expense types.
- Detailed financing reports may later use `principalAmount`, `interestAmount`, rate, amortization, and term data when available, but regular projections must not depend on them.
