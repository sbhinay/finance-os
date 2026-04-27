# FinanceOS Technical Documentation

## 6. Storage Keys

| Key | Type | Description |
|---|---|---|
| `finance_os_accounts` | `Account[]` | Bank and cash accounts |
| `finance_os_cards` | `CreditCard[]` | Credit cards |
| `finance_os_tx` | `Transaction[]` | **Master table — single source of truth** |
| `finance_os_categories` | `Category[]` | Expense/income categories |
| `finance_os_business` | `Business` | Business config, invoices, CRA |
| `finance_os_vehicles` | `Vehicle[]` | Vehicle assets |
| `finance_os_house_loans` | `HouseLoan[]` | Mortgage and loan assets |
| `finance_os_property_taxes` | `PropertyTax[]` | Property tax schedules |
| `finance_os_fixed_payments` | `FixedPayment[]` | Recurring payment definitions |
| `finance_os_dismissed_pending` | `string[]` | Keys of dismissed pending alerts |

**Rule:** `finance_os_tx` is the only table that drives balance calculations. All other tables are configuration/definition tables that trigger or reference transactions.

---

## 7. Transaction System

### Transaction Types

#### User-facing types (selectable in TransactionForm)
| Type | Description | Balance Effect |
|---|---|---|
| `expense` | Money spent | Source account/card debited |
| `income` | Money received | Source account credited |
| `transfer` | Money between own accounts | Source debited, destination credited |
| `refund` | Return of a previous expense | Source account/card credited |
| `dividend` | Corporate dividend to self | Source account credited |

**Note:** `TransactionType` in the TypeScript type currently only includes `income | expense | transfer`. `refund` and `dividend` are planned additions — see Deferred Items.

#### System-assigned types (never shown to user as a choice)
| Type | Description | When |
|---|---|---|
| `adjustment` | Reconciliation correction | When account reconcile creates a balancing entry |
| `payroll` | Payroll income | When income source is flagged as T4 employment |

### Transfer Rules
- Always has `sourceId` (where money leaves) AND `destinationId` (where money arrives)
- No category field — transfers are not expenses or income
- Credit card payment: `sourceId` = bank account, `destinationId` = credit card
- CC to CC balance transfer: both source and destination are credit cards
- TFSA/RRSP contribution: `sourceId` = bank account, `destinationId` = investment account (when built)
- Loan receipt: `sourceId` = liability account (when built), `destinationId` = bank account

### Balance Effect by Type
```
expense:   account.balance -= amount  | card.balance += amount (more owed)
income:    account.balance += amount
refund:    account.balance += amount  | card.balance -= amount (less owed)
dividend:  account.balance += amount
transfer:  source.balance -= amount   | destination.balance += amount
           (for card destination: card.balance -= amount = less owed)
adjustment: applied as income or expense to bring balance to correct value
```

### What Is NOT a Transaction
- Credit card payment (it IS a transfer)
- TFSA/RRSP contribution (it IS a transfer)
- Loan receipt (it IS a transfer from liability account)
- CRA HST remittance (it IS an expense from business account)

---

