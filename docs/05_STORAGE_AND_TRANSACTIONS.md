# FinanceOS Technical Documentation

## 6. Storage Keys and Transaction System

### Storage Keys
| Key | Type | Notes |
|---|---|---|
| `finance_os_accounts` | Account[] | Bank/cash/business accounts |
| `finance_os_cards` | CreditCard[] | Credit card accounts |
| `finance_os_tx` | Transaction[] | Master transaction ledger |
| `finance_os_categories` | Category[] | Income/expense categories |
| `finance_os_business` | Business | Business and CRA settings |
| `finance_os_vehicles` | Vehicle[] | Vehicle assets |
| `finance_os_house_loans` | HouseLoan[] | Mortgage/loan assets |
| `finance_os_property_taxes` | PropertyTax[] | Property tax schedules |
| `finance_os_fixed_payments` | FixedPayment[] | Recurring payment definitions |
| `finance_os_dismissed_pending` | string[] | Dismissed pending notification keys |

### Transaction System
The transaction ledger is the canonical source for all financial movement.

#### Type Behavior
- `expense` and `tax_payment` reduce bank/cash/business sources.
- `income`, `refund`, `dividend`, and `loan_receipt` increase sources.
- `transfer` moves value between source and destination.
- `transfer + cc_payment` reduces bank source and reduces credit card debt without affecting spending or income reports.
- `transfer + loc_draw` moves borrowed cash from a tracked line of credit into a receiving account without treating it as income.
- `loan_payment` reduces the paying source by the full cash amount, even when only part of that amount is true expense.
- `adjustment` can be used for reconcile audits and corrections.

#### Reporting Inclusion Rules
- Expense reportable types: `expense`, `refund`
- Income reportable types: `income`, `dividend`
- Tax-relevant types: `expense`, `income`, `dividend`, `tax_payment`, `loan_payment`, `withdrawal`
- `loan_payment` is a cash outflow for planning, but should not be treated as a normal generic expense by default.
- For mortgages and financed loans, only the interest portion is expense-like; principal is liability reduction.

#### Reconciliation Audit Rows
- Stored as `type: "adjustment"` with `subType: "reconciliation"`.
- Preserves auditability but should be excluded from normal expense/income summaries and most reporting views.

#### Validation and Form Rules
- `amount > 0`
- `sourceId` must be present
- `destinationId` required for `transfer` and `adjustment`
- `subType` required for `transfer`, `tax_payment`, `loan_receipt`, and `loan_payment`
- `categoryId` optional for non-expense/income types
- Mortgage and other `loan_payment` rows should not require a destination account in the current model because the liability side is not yet represented as a first-class destination account.
