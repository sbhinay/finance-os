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

### Reconciliation Rules
- Reconcile metadata is stored on accounts/cards using `balanceBase`, `reconciledBalance`, and `reconciledDate`.
- Reconciliation audit rows are stored as `type: "adjustment"` with `subType: "reconciliation"`.
- Audit entries are excluded from normal reporting views.

### Reporting Rules
- Only `expense` and `refund` are included in expense reporting.
- Only `income` and `dividend` are included in income reporting.
- `transfer` rows, including `cc_payment`, are excluded from standard income/expense summaries unless explicitly included.
- `tax_payment`, `adjustment`, `loan_payment`, and `withdrawal` are also excluded from standard income/expense summaries unless explicitly included.
