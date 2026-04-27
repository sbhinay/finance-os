# FinanceOS Technical Documentation

## 14. Import & Export

### Export
- Full JSON export of all localStorage domains
- CSV export of transaction history (date, type, amount, category, account, mode, tag, description, vehicle, property)
- Export includes all domains: accounts, cards, transactions, categories, business, vehicles, house loans, property taxes, fixed payments

### Import (current state — to be replaced)
- Accepts the app's own JSON export
- Also accepts legacy prototype JSON (migration path — to be removed)
- Migration maps: account names → IDs, category names → IDs

### Import (target state)
- ONLY accept files exported by FinanceOS itself
- Validate `meta.signature === "FINANCEOS-v1"` before processing
- Validate `meta.exportedBy === "FinanceOS"`
- Hard reject any file missing the signature
- Prototype import path to be removed entirely

### Export Format (target)
```json
{
  "meta": {
    "signature": "FINANCEOS-v1",
    "exportedBy": "FinanceOS",
    "appVersion": "1.0",
    "exportedAt": "2026-04-13T18:00:00.000Z"
  },
  "accounts": [...],
  "cards": [...],
  "transactions": [...],
  "categories": [...],
  "business": {...},
  "vehicles": [...],
  "houseLoans": [...],
  "propertyTaxes": [...],
  "fixedPayments": [...]
}
```

---

## 15. Date & Time Standard

### Storage Rules
| Field | Format | Set By | Example |
|---|---|---|---|
| `createdAt` | ISO UTC string | `new Date().toISOString()` | `"2026-04-13T18:00:00.000Z"` |
| `date` | YYYY-MM-DD | User input (accounting date) | `"2026-04-13"` |
| `nextPaymentDate` | YYYY-MM-DD | `advanceOneInterval()` | `"2026-05-06"` |
| `effectiveFrom` | YYYY-MM-DD | User input | `"2026-01-01"` |

### Key Rules
- `createdAt` = when user recorded the transaction — always `now`, never derived from date input
- `date` = accounting date — can be backdated, used for filtering and reporting
- `date` always wins for filtering/sorting/display over `createdAt`
- All date-only comparisons use `.slice(0, 10)` to get YYYY-MM-DD
- `fmtDate()` appends `T12:00:00` before passing to `new Date()` to avoid timezone boundary issues
- Display in form uses `createdAt` for full datetime, `date` for date-only fields

### Historical Data Note
Prototype-imported transactions have mixed `createdAt` formats:
- `"2026-04-06T11:15"` — 16 chars, no timezone (most common)
- `"2026-04-07T17:58:00.000Z"` — full UTC with Z
- `"2026-04-04T08:56:00"` — 19 chars no timezone

`TransactionForm` handles all three formats when pre-filling the edit form. Going forward all new transactions use full ISO UTC format.

---

