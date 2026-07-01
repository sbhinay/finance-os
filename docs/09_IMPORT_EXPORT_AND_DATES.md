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
- `properties`
- `propertyTaxes`
- `futurePayments`

The export is a full JSON snapshot of the current app state.

### Import Behavior
The import process supports:
1. Current-app JSON exports.
2. Legacy prototype JSON using migration logic.

#### Current-app import path
- Reads the same top-level keys the exporter writes.
- Restores vehicles, properties, house loans, property taxes, and fixed payments.
- Restores lender liabilities and validates `linkedLiabilityId` references.
- Preserves and validates optional recurring-origin links and recurring parent ownership.
- Validates Property references from mortgages, property taxes, recurring owners, and transactions.
- Validates optional `linkedHouseLoanId` references and detaches broken mortgage links with an import warning.
- Preserves balance snapshot metadata on accounts and cards.
- Resolves asset source references by ID or name.
- Normalizes legacy `credit_card_payment` rows into canonical `transfer + cc_payment`.
- Legacy reconciliation metadata may be present in old files, but current-account/card balance alignment should use `balanceSnapshotAmount` and `balanceSnapshotDate`.

#### Legacy import path
- Uses `migrateFromPrototype()` to convert older prototype data shapes.
- Maintains new baseline fields when possible.
- Resolves old name-based references into current IDs.

### Source Resolution
Imported source references are resolved by:
1. checking for a matching account/card ID
2. otherwise doing a case-insensitive name match
3. otherwise preserving the original string

This resolution is applied to vehicles, properties, house loans, and fixed payments.

### Validation and Integrity
- Import preview now surfaces warnings and blocking errors before commit.
- Transaction-level preview controls can relink invalid source/destination references, exclude suspect rows, and accept safe normalization warnings.
- Semantic duplicates inside the incoming snapshot are flagged before confirmation.
- Preview cleanup changes only the pending payload; active repositories are untouched until `Confirm Import`.
- Broken transaction source/destination references block import.
- Clearly ambiguous legacy category values fall back to `Other` if that category exists; otherwise they remain unresolved with a warning.
- Import should prefer canonical modern shapes rather than preserving stale legacy transaction structures unchanged.
- Transaction normalization adds stable purposes only when type/subtype or a narrow legacy pattern makes the meaning unambiguous.
- Numbered personal-loan receipt series such as `Loan DP 1` through `Loan DP 7` can be grouped into one lender liability without changing amounts, dates, accounts, or tags.
- Invalid or incomplete recurring origins and recurring parent-owner pairs are detached with an import warning; transaction amounts, dates, descriptions, and categories remain unchanged.
- Legacy house loans create Property parents safely. A standalone property-tax record merges only when its name exactly and uniquely matches a Property; ambiguous records remain unchanged.

### Date & Time Standards
| Field | Format | Meaning |
|---|---|---|
| `createdAt` | ISO UTC | system entry timestamp |
| `date` | YYYY-MM-DD | accounting date |
| `nextPaymentDate` | YYYY-MM-DD | scheduled next occurrence |
| `startDate` | YYYY-MM-DD | stable first-known recurring occurrence/backfill anchor |
| `balanceSnapshotDate` | YYYY-MM-DD | known real-world balance anchor date |

#### Rules
- `date` drives filters, reports, and replay.
- `createdAt` records actual row creation time.
- Recurring `date` is the next due occurrence; recurring `startDate` remains stable as history advances.
- UI normalizes dates by appending `T12:00:00` before parsing to avoid timezone shifts.
- `balanceSnapshotDate` is used as a cutoff in replay logic for the item carrying the snapshot.
- Future cloud sync must preserve these meanings exactly; cloud persistence should not reinterpret accounting dates as live timestamps.
