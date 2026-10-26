# Cheffy 1.0 — Apple App Review checklist

Checked 2026-10-26 against branch `launch-readiness` and TestFlight build 10. This is an honest
pre-submission audit, **not a guarantee of approval**.

**Status key**
- **Pass:** verified, with evidence.
- **Fail:** must be fixed.
- **Not verified:** couldn't be checked here.
- **Owner:** needs your account or decision.

**Blocks?** means it must be resolved before you press Submit.

## Submission blockers (do these first)

1. **Push the two database migrations and deploy the website and dashboard.** Approval needed;
   see "Owner actions" below. Until then, moderation runs only in the app, and the security fixes
   aren't live.
2. **Build 11** with today's fixes (callback page, delete-account depth, keyboard). The app code
   changes are small, but review should see the final build.
3. **Create the reviewer demo account** and enter its credentials and your contact details in
   App Store Connect.
4. **Rename the App Store Connect record**, which currently shows "Cheffy (3a0e77)".
5. **Capture 6.9" screenshots** (1320 × 2868) from the release build.

## Authentication

| Requirement | Status | Evidence | Remediation | System | Blocks? |
|---|---|---|---|---|---|
| Sign-up works | **Pass** | Real sign-ups on build 9 (`awwzaza`, `suhwan`, `epic.michael101` in auth audit log, 25 Oct) | — | App + Supabase Auth | No |
| Email verification | **Pass** | Confirmation link completed for `awwzaza`; Resend SMTP fixed 25 Oct | — | Supabase Auth + Resend | No |
| Login | **Pass** | Login events in auth audit log, incl. after deletion test | — | App | No |
| Session persistence | **Pass** | Encrypted session (AES key in Keychain) reviewed in audit (h7); refresh in foreground only | Optional: Keychain `THIS_DEVICE_ONLY` (hardening) | App | No |
| Error messages | **Pass** | Classified errors: offline vs unavailable vs rate limit (SUPABASE_RELIABILITY_AUDIT.md); new "couldn't sign you in" wording | — | App | No |
| Password recovery | **Pass** | `user_recovery_requested` → login in audit log (25 Oct, test account); PKCE-bound | — | App + Auth | No |
| No duplicate sign-up requests | **Pass** | In-flight guard + tests (`useAuthSubmit`, `rateLimit.test.ts`) | — | App | No |
| No false "offline" messages | **Pass** | `classifyError` unit tests | — | App | No |
| Sign-up rate-limit bug | **Pass** | Fixed (commit 1f6ab44); custom SMTP lifts the 2/hour limit | Check the hosted "emails per hour" limit (dashboard) | Supabase | No |
| Reviewer demo account works | **Owner** | Not created | Create a dedicated account with real content (docs/APP_STORE_METADATA.md) | You | **Yes** |

## User-generated content (Guideline 1.2)

| Requirement | Status | Evidence | Remediation | System | Blocks? |
|---|---|---|---|---|---|
| Terms/EULA accepted at sign-up with zero tolerance | **Pass** | Terms checkbox on sign-up; `terms_acceptance` migration; terms page live | — | App + web | No |
| Report a post | **Pass** | Two real reports filed from the app on 26 Oct (live DB) | — | App + DB | No |
| Report a comment | **Pass (code) / Not verified (device)** | DB tests cover comment reports; UI path is long-press → Report | Try once on build 10/11 | App | No |
| Report a profile | **Pass (code) / Not verified (device)** | DB tests; profile "•••" → Report | Try once on device | App | No |
| Block users | **Pass** | DB tests (`privacy`, `security-audit`): block hides both ways; now also ends Co-Chef access | — | DB | No |
| Objectionable-content filter | **Pass** | Slur filter triggers on posts, comments, profiles, collections and tags (`moderation` tests) | Labels and Co-Chef reviews aren't filtered (hardening) | DB | No |
| Moderation dashboard | **Partially complete** | Built and tested locally (DB tests + mocked UI); not deployed | Push migrations and deploy site, then sign in as @chefshin and review the 2 open reports | DB + web | **Yes** (Terms promise 24-hour review) |
| Moderators alerted to new reports | **Owner** | Dashboard badge works once deployed; email alert function written, not deployed | Set Resend key and secret, deploy `moderation-alert` (MODERATION_ADMIN_GUIDE.md) | Supabase | Recommended |
| Abusive content handled | **Pass (code)** | Remove/restore, suspend/unsuspend, auto-hide at 3 reporters, append-only audit log | — | DB | No |
| Published contact | **Pass** | `mailto:hello@cheffy.me` on every page; MX via Cloudflare Email Routing | Send yourself a test email to confirm routing | Web | No |

## Account management (Guideline 5.1.1(v))

| Requirement | Status | Evidence | Remediation | System | Blocks? |
|---|---|---|---|---|---|
| In-app account deletion | **Pass** | Deleted test account `cheffy` on 25 Oct (audit log `user_deleted`); 401 handling fixed | — | App + Edge Function | No |
| Content and photos removed | **Pass** | Edge Function removes `{uid}/` in both buckets, then the auth user (cascade); deeper paths now covered too | Redeploy `delete-account` (approval) | Supabase | No |
| No unintended retention | **Pass** | Report evidence about a deleted author is scrubbed (DB test) | Optional: mention report evidence retention in the Privacy Policy | DB | No |
| Privacy Policy accurate | **Pass** | Policy matches data collected (email, photos, content, user id, push token; contacts stay on device) | — | Web | No |
| App Privacy label | **Owner** | Table in APP_STORE_SUBMISSION_CHECKLIST.md §5 | Enter in App Store Connect | You | **Yes** |

## iOS functionality

| Requirement | Status | Evidence | Remediation | System | Blocks? |
|---|---|---|---|---|---|
| Photo picker | **Pass** | Used daily by testers; `NSPhotoLibraryUsageDescription` set | — | App | No |
| Camera permission only when used | **Pass** | `requestCameraPermissionsAsync` on tapping Camera (`PhotoStrip.tsx:85`) | — | App | No |
| Notifications permission only when useful | **Pass** | Asked after first follow (`offerOnce`) | — | App | No |
| Contacts permission | **Pass** | Asked from Invite Contacts only, with a specific purpose string | — | App | No |
| Deep links / universal links | **Pass (code)** | AASA for `/invite`, `/auth/callback`, `/user`, `/post`; PKCE callback; callback page now forwards only auth fields | Re-test a confirmation link on build 11 | App + web | No |
| Feed, Discover, Rankings, Profile, comments/replies, follows, Co-Chef, uploads, create/edit, settings | **Pass (simulator) / Not verified (build 11)** | Simulator checks this week; testers on builds 9–10 | Quick pass on build 11 | App | No |
| Swipe-to-dismiss banners; follow from Activity | **Not verified on device** | Unit tests pass | Check on build 10/11 | App | No |

## Backend

| Requirement | Status | Evidence | Remediation | System | Blocks? |
|---|---|---|---|---|---|
| Supabase health | **Pass** | `/auth/v1/health` 200; database restart on 25 Oct was provider-side (SUPABASE_RELIABILITY_AUDIT.md) | Consider the Pro plan for launch | Supabase | No |
| Storage uploads | **Pass** | 127 images with valid paths; new path constraint validated against all live rows | — | Supabase | No |
| RLS correctness | **Partially complete** | Security audit: 14 leads, all fixed in `20261026000002_security_hardening.sql` with regression tests | Push migration (approval) | DB | **Yes** |
| Migrations | **Partially complete** | 2 new migrations tested on PGlite (228 DB tests pass) | `supabase db push` after you approve | DB | **Yes** |
| Graceful network errors | **Pass** | Timeouts, retries, error states (reliability audit) | — | App | No |
| No hard-coded secrets | **Pass** | Audit h8: no secret or service key in git; only the publishable key, by design | — | Repo | No |
| Production build uses production Supabase | **Pass** | EAS production environment variables (URL and publishable key); build 10 reached TestFlight | — | EAS | No |

## Owner actions (I need your OK or your account)

1. **Approve:** `supabase db push`, which applies `20261026000001_moderation_dashboard` and
   `20261026000002_security_hardening`. Both are non-destructive: no data is deleted.
2. **Approve:** merge `launch-readiness` to main and push. That deploys the website and the
   dashboard through Cloudflare.
3. **Approve:** redeploy `delete-account` (deeper deletion walk) with
   `supabase functions deploy delete-account --use-api`.
4. **Your accounts:**
   - Resend API key and alert secret for email alerts.
   - Reviewer demo account.
   - App Store Connect fields: name, screenshots, App Privacy, review contact.
5. **Recommended in the Supabase dashboard:**
   - enable "Secure password change";
   - set a session timebox;
   - consider CAPTCHA on sign-up (it raises the cost of fake reporter accounts).
