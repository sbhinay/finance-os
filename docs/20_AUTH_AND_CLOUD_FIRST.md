# FinanceOS Authentication And Cloud-First Architecture

## Authentication Boundary

FinanceOS does not mount financial hooks or render account data until Supabase has
confirmed a session and the initial cloud snapshot check has completed.

Supported entry methods:

- Google OAuth, once enabled in Supabase Auth
- Email and password
- Email account creation and verification
- Password recovery

Authentication tokens use browser `sessionStorage`. OAuth redirect state survives
the redirect in the same tab, while closing the browser session requires a new
login where browser behavior permits.

## Initial Data Load

After authentication:

1. FinanceOS requests the authenticated user-owned guarded snapshot.
2. If a snapshot exists, it replaces the active local working cache.
3. If no snapshot exists, FinanceOS initializes an empty profile.
4. Only then does the financial application mount.

The local cache is scoped operationally by this bootstrap and is cleared between
users. JSON import remains available after authentication as a recovery and
portability tool; it is not part of first-login onboarding.

## Guarded Autosave

- Committed repository writes publish `financeOS:dataChanged`.
- The authenticated gate debounces those events for 1.5 seconds and saves through
  `save_app_snapshot_guarded`.
- Every write supplies the last observed cloud revision. A stale tab is blocked
  rather than overwriting newer data.
- The global status pill shows saved, pending, saving, offline, newer-cloud,
  conflict, and failure states.
- Bootstrap replacement events are ignored, so loading cloud data is not treated
  as a new user edit.
- Focus and 30-second checks detect revisions created by another device or tab.
- Offline edits stay local and retry after the browser reconnects.

## Session Lifecycle

- Activity resets a 15-minute inactivity clock.
- A warning appears after 14 minutes and allows the user to continue.
- At 15 minutes, FinanceOS attempts a final guarded save and signs out.
- Manual sign-out follows the same final-save path.
- If the final save fails, FinanceOS keeps the session and local cache active and
  offers retry or stay-signed-in actions. It never claims sign-out succeeded while
  silently dropping local work.
- Successful sign-out clears the active financial cache before returning to the
  authentication screen.

## Identity Linking

- FinanceOS does not merge identities by comparing email text.
- A signed-in email/password user may explicitly choose `Link Google`.
- The link uses Supabase `linkIdentity` and requires manual identity linking to be
  enabled in the Supabase Auth configuration.
- Existing Google identities are displayed as connected and are not linked again.

## External Configuration Still Required

- Enable Google as a Supabase Auth provider.
- Configure the Google OAuth client ID and client secret in Supabase, never in
  browser environment variables.
- Add the deployed FinanceOS callback URL and approved local callback URL.
- Review email verification and password-recovery redirect URLs.

Provider configuration is an external operation and is not performed by the
application build.
