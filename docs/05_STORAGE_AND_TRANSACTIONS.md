# FinanceOS Technical Documentation

## 6. Storage Keys

| Key | Type | Description |
|---|---|---|
| `finance_os_accounts` | `Account[]` | Bank, cash, and business accounts |
| `finance_os_cards` | `CreditCard[]` | Credit cards and LOC-style liabilities |
| `finance_os_tx` | `Transaction[]` | Master ledger used for replay, history, and reporting |
| `finance_os_categories` | `Category[]` | Income/expense categories |
| `finance_os_business` | `Business` | Business settings, invoices, CRA, rate settings |
| `finance_os_vehicles` | `Vehicle[]` | Vehicle assets |
| `finance_os_house_loans` | `HouseLoan[]` | Mortgage and loan assets |
| `finance_os_property_taxes` | `PropertyTax[]` | Property tax schedules |
| `finance_os_fixed_payments` | `FixedPayment[]` | Recurring payment definitions |
| `finance_os_dismissed_pending` | `string[]` | Dismissed pending transaction keys |

Rule:
- `finance_os_tx` remains the activity ledger.
- Accounts and cards also persist baseline metadata used by replay:
  - `balanceBase`
  - `reconciledBalance`
  - `reconciledDate`

---

## 7. Transaction System

### User-facing types (shown in `TransactionForm`)
| Type | Description | Balance Effect |
|---|---|---|
| `expense` | Normal spend | Account decreases, card debt increases |
| `income` | Normal income | Source increases |
| `transfer` | Internal transfer | Source decreases, destination increases |
| `credit_card_payment` | Pay card from bank | Bank source decreases, destination card debt decreases |
| `refund` | Reversal of prior spend | Account increases, card debt decreases |
| `dividend` | Personal dividend income | Source increases |
| `loan_receipt` | Borrowed money received | Source increases |
| `loan_payment` | Debt payment | Source decreases |
| `withdrawal` | Personal draw / owner withdrawal | Source decreases |

### System-assigned types
| Type | Description | Notes |
|---|---|---|
| `tax_payment` | CRA remittance or other tax outflow | Not treated as a general expense report row |
| `adjustment` | Reconciliation/correction/opening-balance style system adjustment | `subType: "reconciliation"` is used for reconcile audit rows |

### Destination Rules
- `destinationId` is required for:
  - `transfer`
  - `credit_card_payment`
  - `adjustment`
- `destinationId` is optional for other types.

### Sub-type Rules
- `tax_payment`, `loan_receipt`, `loan_payment`, and `transfer` can carry sub-types.
- `adjustment` also carries sub-types such as:
  - `reconciliation`
  - `correction`
  - `write_off`
  - `opening_balance`

### Balance Effect Reference
```text
expense:
  bank/cash/business source -> openingBalance -= amount
  credit card source        -> openingBalance += amount

income / dividend / loan_receipt:
  bank/cash/business source -> openingBalance += amount
  credit card source        -> openingBalance -= amount

tax_payment / loan_payment / withdrawal:
  bank/cash/business source -> openingBalance -= amount
  credit card source        -> openingBalance += amount

transfer:
  source account           -> openingBalance -= amount
  source card              -> openingBalance -= amount
  destination account      -> openingBalance += amount
  destination card         -> openingBalance -= amount

credit_card_payment:
  source bank account      -> openingBalance -= amount
  destination credit card  -> openingBalance -= amount

adjustment:
  source account/card      -> openingBalance += amount
  destination account/card -> openingBalance -= amount
```

### Reconciliation Rows
- Reconcile actions may create an audit row with:
  - `type: "adjustment"`
  - `subType: "reconciliation"`
- These rows remain in storage for traceability.
- Normal reporting views should exclude them from day-to-day expense and income summaries.

### Reporting Helpers
- `isExpenseReportable(type)` currently includes:
  - `expense`
  - `refund`
- `isIncomeReportable(type)` currently includes:
  - `income`
  - `dividend`

That means:
- `credit_card_payment`
- `tax_payment`
- `adjustment`
- `loan_payment`
- `withdrawal`

are intentionally outside normal spending category summaries unless a view explicitly includes them.

---
