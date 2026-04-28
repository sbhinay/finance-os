# FinanceOS Technical Documentation

## 14. Import & Export

### Export
Current app export writes a full JSON snapshot of the local domains:

```json
{
  "meta": {
    "exportedAt": "2026-04-28T12:00:00.000Z",
    "appVersion": "next-1.0"
  },
  "bankAccounts": [...],
  "creditCards": [...],
  "transactions": [...],
  "categories": [...],
  "business": {...},
  "vehicles": [...],
  "houseLoans": [...],
  "propertyTaxes": [...],
  "futurePayments": [...]
}
```

Important:
- Export currently uses `bankAccounts` and `creditCards`, not `accounts` and `cards`.
- `futurePayments` is the fixed payments export key.
- Reconciliation metadata on accounts/cards must survive export:
  - `balanceBase`
  - `reconciledBalance`
  - `reconciledDate`

### Import
Current import supports two sources:
1. current-app JSON exports
2. legacy prototype JSON via migration

Current-app import path:
- reads the same domains the exporter writes
- restores assets such as:
  - vehicles
  - house loans
  - property taxes
  - fixed payments
- preserves reconciliation metadata already stored on accounts and cards

Legacy import path:
- uses `migrateFromPrototype(...)`
- preserves newer baseline fields when present in migrated shapes
- resolves old name-based references into current IDs where needed

### Source ID Resolution
Some imported asset rows may carry account/card references from older data in name form. Import logic uses a resolver that:
1. accepts a direct ID if it already matches an account/card
2. otherwise attempts a case-insensitive name match
3. falls back to the original string when no match is found

This is currently used for:
- vehicles
- house loans
- fixed payments

### Current Symmetry Goal
The app should be able to:
1. export current state
2. clear data
3. import that same file
4. restore all supported domains without losing referential integrity

That includes:
- transactions
- business data
- vehicles
- house loans
- property taxes
- fixed payments
- reconciliation metadata

---

## 15. Date & Time Standard

### Storage Rules
| Field | Format | Source | Example |
|---|---|---|---|
| `createdAt` | ISO UTC string | system-assigned | `"2026-04-28T16:30:00.000Z"` |
| `date` | `YYYY-MM-DD` | user-selected accounting date | `"2026-04-28"` |
| `nextPaymentDate` | `YYYY-MM-DD` | schedule logic | `"2026-05-12"` |
| `effectiveFrom` | `YYYY-MM-DD` | user input | `"2026-01-01"` |
| `reconciledDate` | `YYYY-MM-DD` | reconcile workflow | `"2026-04-28"` |

### Current Rules
- `date` is the primary accounting date for filters, summaries, and balance replay.
- `createdAt` records when the row was entered.
- On edit, `TransactionForm` preserves the original `createdAt` when possible instead of rewriting history unnecessarily.
- Date-only comparisons typically use `YYYY-MM-DD` strings.
- UI date parsing often appends `T12:00:00` before `new Date(...)` to avoid timezone boundary problems.

### Reconciliation Rule
- Replay should ignore source transactions before the source row's `reconciledDate`.
- `reconciledDate` is therefore a balance baseline cutoff, not just display metadata.

### Historical Data Note
Older imported files may still contain mixed timestamp formats in `createdAt`. The edit form normalizes these for display by falling back to `date` first and slicing to `YYYY-MM-DD` when needed.

---
