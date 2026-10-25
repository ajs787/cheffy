# Supabase Reliability Audit — sign-up failures

Investigated 2026-10-25 against the live project `yqzycfujpzibzkkdybyu`. Everything below is
labelled as **confirmed** (seen in data, logs or code) or **unconfirmed** (needs a dashboard
or support check that I can't do from here).

## Confirmed findings

### 1. The database restarted at 02:11 UTC on Oct 25 (10:11 PM Eastern, Oct 24)
- `pg_postmaster_start_time()` = **2026-10-25 02:11:01 UTC**. That's four minutes after the
  burst of `57P03` ("shutting down") and `57P01` ("administrator shutdown") errors you saw
  at 10:07 PM Eastern. Statistics were reset at the same time.
- **Cheffy's load did not cause it.**
  - Activity in the 15 minutes before: 1 like, 1 notification, nothing else.
  - Since the restart, every query together has used **< 1 second** of database time
    (`inspect db outliers`).
  - Database size is 16 MB, cache hit rate is 100%, 16 of 60 connections are in use, and
    there are no long-running queries, locks or blocking.
- **No change of mine triggered it.** My last migration push was Oct 23 at 19:06 UTC, more
  than 31 hours earlier.
- An `administrator shutdown` followed by a clean restart, with Supabase showing an
  "investigating a technical issue" banner, points to **Supabase infrastructure or
  maintenance**. I can't see their infrastructure logs, so the cause itself is
  **unconfirmed**.

### 2. The app called real server failures "offline" (app bug, fixed)
- supabase-js reports **every HTTP 5xx** (500–530) as `AuthRetryableFetchError`, the same
  type it uses for a lost connection.
- Cheffy's `isNetworkError` treated that type as "offline". So while the database
  restarted, and whenever Supabase fails to send a confirmation email (a 500), people saw
  **"You seem to be offline"** on a working connection.

### 3. No account has been created since Oct 23, 17:39 UTC
- `auth.users` has no rows created after that, including the 17 hours the database has been
  healthy.
- When Supabase can't send the confirmation email, it **cancels the sign-up** and creates no
  user. That matches "users who attempted signup did not appear".
- Custom SMTP is configured: `smtp.resend.com:465`, sender `no-reply@cheffy.me`, read via
  `supabase config diff`. Resend's DKIM and `send.cheffy.me` records exist in DNS.
- **Unconfirmed:** whether Resend accepts the sends. That's the most likely remaining blocker
  for sign-ups on a healthy database. Check below.

### 4. "Too many attempts"
- Before custom SMTP, the built-in sender allowed about 2 emails an hour, which was
  confirmed earlier from the hourly confirmation counts.
- Custom SMTP lifts that, but Supabase's own email rate limit still applies (default 30 an
  hour with custom SMTP). The live value isn't readable via the CLI ("unmanaged"), so
  **check it in the dashboard**.

### Also confirmed
- **The sign-up code is clean:** one Supabase client; one sign-up call and one resend call,
  each user-triggered; no effects that call auth; no automatic retries of mutations
  (`retry: 0`). The in-flight guard has been in place since build 7.
- **Configuration is correct:** builds use the production EAS environment (project URL plus
  publishable key only). Site URL is `https://cheffy.me`, and redirects allow
  `https://cheffy.me/**` and `exp://**`.
- **Auth is healthy now:** `/auth/v1/health` returns 200 in about 80 ms (GoTrue v2.197.0).

## Fixes implemented (app side)

| File | Change |
|---|---|
| `src/lib/errors.ts` | New `classifyError`: offline (confirmed by the OS), timeout, unreachable, unavailable (5xx, or Postgres `57P0x`/`08xxx`/`53300`), email_send, rate_limit, other. Each has its own message, and none uses "offline" unless the phone really is. |
| `src/lib/query/client.ts` | The classifier gets the OS network state. Reads retry only for timeouts and outages, with exponential backoff and full jitter (≤ 15 s), at most 2 retries while Supabase is unavailable. Rate limits and ordinary errors are never retried. |
| `src/lib/supabase/fetchWithTimeout.ts` + `client.ts` | Every Supabase request gets a time limit: 20 s, or 120 s for photo uploads and the delete-account function. Stalled requests end in "The request took too long…" instead of an endless spinner. |
| `src/features/auth/useAuthSubmit.ts` | An ambiguous sign-up (timeout or outage) says the account *may* exist: "If a confirmation email arrives, your account was created." The `[auth]` diagnostics now include kind, status, code, duration and app version; never email, password or tokens. |
| `src/components/ui/ErrorState.tsx` | Says "Can't reach Cheffy right now" for outages, and "You're offline" only when offline. |
| `src/app/(app)/(tabs)/discover.tsx` | Shows an error state during an outage instead of "The table is just getting set". |

Already in place: one request per tap, "Creating account…", form values kept after errors,
countdowns only for a server-given wait, and no automatic retry of sign-up.

## Needs you (dashboard)

1. **Resend → Emails / Logs:** look for sends from `no-reply@cheffy.me` since Oct 23, and
   any "domain not verified" or bounce errors. Also check **Resend → Domains** shows
   cheffy.me as **Verified**.
2. **Supabase → Logs → Auth:** filter `/signup` since Oct 23. Look for 500 "Error sending
   confirmation email" (SMTP), 429 `over_email_send_rate_limit`, or 503.
3. **Supabase → Authentication → Rate Limits:** check "emails sent per hour". With custom
   SMTP, about 100 is reasonable for launch.
4. **Oct 24 outage:** check status.supabase.com and Supabase → Settings → Infrastructure
   for a maintenance or restart event near 02:07 UTC Oct 25. If there's no public incident,
   open a support ticket with the project ref and those times.
5. **Compute size:** 60 max connections and 224 MB shared buffers suggest the smallest
   (Nano or free) instance. Free projects can also pause. For a public launch, consider the
   Pro plan; I haven't changed it.

## Verification

| Test | Result |
|---|---|
| Error classification: 5xx is not offline, Postgres shutdown, email failure, 429, timeout, real offline | ✅ unit tests (`errors.test.ts`) |
| Request timeout ends a stalled call; long limits for uploads and jobs | ✅ unit tests (`fetchWithTimeout.test.ts`) |
| Retry policy: no retry for 429 or 4xx; bounded with jitter for outages | ✅ unit tests (`client.test.ts`) |
| One request per tap; server-given waits only | ✅ unit tests (`rateLimit.test.ts`) + code review |
| Full suite | ✅ 381 tests, typecheck and lint clean |
| Real sign-up, email verification, duplicate email, TestFlight | ⏳ **Not run by me.** It would create real accounts and send real email on production. Test on build 9 after the dashboard checks. |
| Simulated 429, 503 or outage against production | ❌ deliberately not done |

## Remaining risks
- If Resend rejects sends, **no one can sign up**, whatever the app does. Check item 1
  first.
- Another Supabase restart will still briefly fail requests. The app now says so
  accurately and recovers on its own.
- Builds 8 and earlier still show "You seem to be offline" for server errors; build 9
  fixes it.
