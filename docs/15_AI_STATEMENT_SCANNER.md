# AI Statement Scanner

## Architecture

The scanner is an input path into the canonical ledger, not a second transaction system.

1. The user explicitly selects the statement account/card and one to five images.
2. `StatementScannerSection.tsx` sends multipart form data to `/api/statement-scanner`.
3. The server route validates image count, MIME type, and size.
4. A replaceable provider adapter extracts structured candidates.
5. The browser validates provider category suggestions against current categories and displays an editable preview.
6. Semantic, same-day, and nearby-amount duplicate checks run before confirmation.
7. Only enabled, valid rows are built through `buildCanonicalTransaction()` and persisted in one canonical batch.
8. No transaction is written before explicit confirmation.

## Security And Privacy

- `ANTHROPIC_API_KEY` is server-only and must never use a `NEXT_PUBLIC_` prefix.
- Images are converted in request memory and are not persisted by FinanceOS.
- Responses use `cache-control: no-store`.
- The UI requires explicit consent for each extraction session.
- Provider-side image handling and retention remain governed by the configured provider account and API terms.
- Requests are limited to five supported images of at most 8 MB each.

## Configuration

```text
AI_SCANNER_PROVIDER=anthropic
AI_SCANNER_MODEL=claude-sonnet-4-20250514
ANTHROPIC_API_KEY=server-secret
```

The provider factory is in `lib/statementScanner/index.ts`. A replacement provider implements the `StatementScannerProvider` interface without changing scanner UI or ledger persistence.

## Review Rules

- Exact semantic duplicates default to skipped.
- Same date, amount, and source is shown as a probable duplicate.
- Same amount within three days is shown as a possible duplicate.
- The user may deliberately re-enable a legitimate duplicate.
- Credit-card payments require a paying source and card destination.
- Transfers and LOC draws require a destination.
- Unknown category suggestions are discarded rather than guessed.
- Low-confidence or uncategorized rows are counted for follow-up in the completion summary.
