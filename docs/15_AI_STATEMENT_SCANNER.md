# AI Statement Scanner

## Architecture

The scanner is an input path into the canonical ledger, not a second transaction system.

1. The user explicitly selects the statement account/card and one to five images.
2. `StatementScannerSection.tsx` sends multipart form data to `/api/statement-scanner`.
3. `GET /api/statement-scanner` exposes safe provider readiness metadata before extraction.
4. The server route validates provider configuration, image count, MIME type, and size.
5. A replaceable provider adapter extracts structured candidates.
6. The browser validates provider category suggestions against current categories and displays an editable preview.
7. Semantic, same-day, and nearby-amount duplicate checks run before confirmation.
8. Only enabled, valid rows are built through `buildCanonicalTransaction()` and persisted in one canonical batch.
9. No transaction is written before explicit confirmation.

## Security And Privacy

- `ANTHROPIC_API_KEY` is server-only and must never use a `NEXT_PUBLIC_` prefix.
- Images are converted in request memory and are not persisted by FinanceOS.
- Responses use `cache-control: no-store`.
- The UI requires explicit consent for each extraction session.
- The UI shows provider readiness before upload/extraction and disables extraction when the server provider is not configured.
- Provider-side image handling and retention remain governed by the configured provider account and API terms.
- Requests are limited to five supported images of at most 8 MB each.

## Configuration

```text
AI_SCANNER_PROVIDER=anthropic
AI_SCANNER_MODEL=claude-sonnet-4-20250514
ANTHROPIC_API_KEY=server-secret
```

The provider factory is in `lib/statementScanner/index.ts`. A replacement provider implements the `StatementScannerProvider` interface without changing scanner UI or ledger persistence.

For local acceptance testing without sending images to an external provider, use:

```text
AI_SCANNER_PROVIDER=local_fixture
AI_SCANNER_FIXTURE_JSON={"accountHint":"Local fixture","transactions":[{"date":"2026-06-29","description":"Fixture Row","amount":12.34,"purpose":"general_expense","confidence":"high"}]}
```

`local_fixture` is server-only and deterministic. It validates the same JSON response shape and exercises the API, editable preview, duplicate review, and canonical confirmation path, but it is not OCR and must not be treated as a live extraction provider.

## Live Provider Verification

After a real server-side provider key is configured, run one read-only live OCR check with a user-approved statement image:

```text
npm run validate:scanner:live -- --image C:\path\to\statement.png
```

This script:

- requires an external configured provider such as `anthropic`
- sends only the image passed with `--image`
- uses a small temporary category/account context
- validates the provider response through the same parser used by the app
- prints a short JSON summary and first five extracted rows
- does not write transactions, localStorage, cloud snapshots, or files

Do not commit provider keys or private statement images. Keep live verification output out of source control unless it has been manually redacted.

## Review Rules

- Exact semantic duplicates default to skipped.
- Same date, amount, and source is shown as a probable duplicate.
- Same amount within three days is shown as a possible duplicate.
- The user may deliberately re-enable a legitimate duplicate.
- Credit-card payments require a paying source and card destination.
- Transfers and LOC draws require a destination.
- Unknown category suggestions are discarded rather than guessed.
- Low-confidence or uncategorized rows are counted for follow-up in the completion summary.
