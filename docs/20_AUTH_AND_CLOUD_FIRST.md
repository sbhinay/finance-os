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

## External Configuration Still Required

- Enable Google as a Supabase Auth provider.
- Configure the Google OAuth client ID and client secret in Supabase, never in
  browser environment variables.
- Add the deployed FinanceOS callback URL and approved local callback URL.
- Review email verification and password-recovery redirect URLs.

Provider configuration is an external operation and is not performed by the
application build.
