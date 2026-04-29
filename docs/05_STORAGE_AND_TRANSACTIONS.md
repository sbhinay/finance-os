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
- `credit_card_payment` reduces bank source and reduces credit card debt.
- `adjustment` can be used for reconcile audits and corrections.

#### Reporting Inclusion Rules
- Expense reportable types: `expense`, `refund`
- Income reportable types: `income`, `dividend`
- Tax-relevant types: `expense`, `income`, `dividend`, `tax_payment`, `loan_payment`, `withdrawal`

#### Reconciliation Audit Rows
- Stored as `type: "adjustment"` with `subType: "reconciliation"`.
- Preserves auditability but should be excluded from normal expense/income summaries and most reporting views.

#### Validation and Form Rules
- `amount > 0`
- `sourceId` must be present
- `destinationId` required for `transfer`, `credit_card_payment`, and `adjustment`
- `categoryId` optional for non-expense/income types
