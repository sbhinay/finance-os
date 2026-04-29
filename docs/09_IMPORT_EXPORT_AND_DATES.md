# FinanceOS Technical Documentation

## 10. Import, Export, and Date Standards

### Export Format
The current app exports the following domains:
- `bankAccounts`
- `creditCards`
- `transactions`
- `categories`
- `business`
- `vehicles`
- `houseLoans`
- `propertyTaxes`
- `futurePayments`

The export is a full JSON snapshot of the current app state.

### Import Behavior
The import process supports:
1. Current-app JSON exports.
2. Legacy prototype JSON using migration logic.

#### Current-app import path
- Reads the same top-level keys the exporter writes.
- Restores vehicles, house loans, property taxes, and fixed payments.
- Preserves reconciliation metadata on accounts and cards.
- Resolves asset source references by ID or name.

#### Legacy import path
- Uses `migrateFromPrototype()` to convert older prototype data shapes.
- Maintains new baseline fields when possible.
- Resolves old name-based references into current IDs.

### Source Resolution
Imported source references are resolved by:
1. checking for a matching account/card ID
2. otherwise doing a case-insensitive name match
3. otherwise preserving the original string

This resolution is applied to vehicles, house loans, and fixed payments.

### Date & Time Standards
| Field | Format | Meaning |
|---|---|---|
| `createdAt` | ISO UTC | system entry timestamp |
| `date` | YYYY-MM-DD | accounting date |
| `nextPaymentDate` | YYYY-MM-DD | scheduled next occurrence |
| `reconciledDate` | YYYY-MM-DD | reconciliation baseline date |

#### Rules
- `date` drives filters, reports, and replay.
- `createdAt` records actual row creation time.
- UI normalizes dates by appending `T12:00:00` before parsing to avoid timezone shifts.
- `reconciledDate` is used as a cutoff in replay logic.
