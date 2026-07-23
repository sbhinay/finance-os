# FinanceOS Security Readiness

## Scope And Status

This is an engineering readiness baseline informed by OWASP ASVS. It is not a
security certification, penetration test, compliance opinion, or guarantee.

## Data Classification

- Highly sensitive: transaction history, balances, debts, tax records, invoices,
  statement images, exported JSON, and restore snapshots.
- Authentication data: Supabase sessions and user identity.
- Secrets: model-provider keys and any Supabase service-role credential.
- Public configuration: Supabase project URL and publishable browser key, protected
  by authentication and row-level security rather than secrecy.

## Trust Boundaries

- The browser owns the current local working copy.
- Supabase Auth establishes user identity; RLS and guarded RPCs isolate cloud data.
- Snapshot tables are client-read-only. Revisioned writes pass through the guarded
  database function.
- Statement images cross a server API boundary only after explicit user action.
  Provider secrets remain server-only.
- JSON import is untrusted input and must pass normalization, reference checks,
  preview, and explicit confirmation.

## Implemented Baseline

- CSP, clickjacking, MIME-sniffing, referrer, browser-feature, and opener headers.
- Guarded snapshot revisions, append-only history, RLS, stale-write rejection, and
  pre-operation restore points for signed-in import and Clear All.
- Scoped local cleanup that does not erase cloud authentication or unrelated
  origin storage.
- Scanner file-count, per-file, aggregate-size, media-type, metadata-count,
  no-store, and basic per-process rate-limit controls.
- CI build, high-severity dependency audit, security contract validation, and a
  tracked-file secret-pattern check.

## Known Gaps Before Public Commercial Deployment

- Replace the in-process scanner rate limiter with a distributed authenticated
  limiter at the hosting edge or database.
- Require authenticated authorization for paid scanner-provider access.
- Add production monitoring, alerting, structured audit events, and incident
  response ownership.
- Define backup retention, user deletion, legal retention, privacy notices, and
  breach-response procedures with qualified legal/security reviewers.
- Commission independent threat modeling, penetration testing, and any required
  certification only after deployment architecture is stable.

## Operational Checklist

- Never expose provider or service-role keys through `NEXT_PUBLIC_*`.
- Rotate credentials immediately if committed, logged, or shared.
- Apply Supabase migrations deliberately and verify RLS with separate test users.
- Keep JSON export available as an independent user-controlled backup.
- Review `npm audit` findings; do not suppress high-severity findings without a
  written risk decision.
- Test restore and conflict handling before each production release.
- Record destructive imports, restores, clears, deletes, and bulk repairs when the
  audit-event phase is implemented.
