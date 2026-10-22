# Cheffy — App Store Compliance Audit

Audited 2026-10-22 against the repository at `e9d8e2b`, the live Supabase project
(`yqzycfujpzibzkkdybyu`) and TestFlight build 1.0.0 (5). Every status below is based on code
read, a command run, or a device test. Anything that wasn't observed directly is marked
**Manual**.

Status key:
- **Pass:** verified.
- **Fail:** missing or broken.
- **Partial:** exists, but falls short of the guideline.
- **Manual:** needs a check that can't be automated or hasn't been done.

Severity:
- **Critical:** likely App Review rejection or a data or privacy breach.
- **High:** likely rejection or real user harm.
- **Medium / Low:** quality or hardening.

## Summary

| Area | Status |
|---|---|
| 1.2 User-generated content | **Partial**: reporting and blocking work, but there's no moderation workflow, no way to hide content or ban users, and no filtering |
| 2.1 App completeness | **Partial**: only development builds exist; no production build, no demo account |
| 4.8 Login services | **Pass (N/A)**: email and password only, with no third-party login, so Sign in with Apple isn't required |
| 5.1 Privacy and account deletion | **Partial**: in-app deletion works, but photo cleanup runs only on the phone; no support contact or privacy link in the app |

Blocking items before submission: **A1, A2, A3, A5, A8, A9** (below).

## Fix progress

| Item | Change | State |
|---|---|---|
| A5 support contact | `SUPPORT_EMAIL = hello@cheffy.me`; a tappable "Contact support" in Settings and an email link in Terms | Built. **hello@cheffy.me must receive mail** (Cloudflare Email Routing) |
| A15 privacy link | "Privacy policy" in Settings, plus Privacy Policy links in Terms and in the sign-up agreement | Built |
| A6 terms record | Sign-up sends `terms_version`, which the profile copies; clients can't write it; `accept_terms()` for future versions (`20261022000002`) | Live (pushed 2026-10-22). DB tests in `terms.test.ts` |
| A1 moderation workflow | `moderators` table, `moderation_queue()` and `moderate()` (remove, restore, dismiss, suspend, unsuspend), an action log, and a moderators-only Settings → Moderation screen. Optional webhook alert (Discord/Slack) on each new report (`20261022000003`) | Live (pushed 2026-10-22); @chefshin is the moderator. Settings → Moderation checked in the simulator (empty queue). **A filled queue is unverified on a device** (no real reports yet). The webhook alert isn't configured |
| A2 suspension | Bans the login (`auth.users.banned_until`), takes down posts and comments, blocks new posts and comments; reversible | Live and DB-tested |
| A3 filtering | Whole-word slur filter (sees through common character swaps) on posts, comments, profiles, collections and tags; 3 separate reporters automatically hide a post or comment until review | Live and DB-tested (live check: "n1gg3r" blocked, "retard the dough" allowed). Image screening isn't done (documented risk) |
| A14 account deletion | The `delete-account` Edge Function removes every photo on the server, then deletes the auth user (cascades). The app calls it; the service-role key stays on Supabase | Deployed 2026-10-22. Refuses no-token, publishable-key-only, forged-token and GET requests (401/405). **A real deletion hasn't been run yet**: needs a throwaway account (checklist §7). Builds 5 and earlier still use the older phone-side path |
| A7 production build | Production EAS environment holds the public URL and publishable key; build 6 started with the `production` profile | **In progress**: waiting for the Apple sign-in prompt |
| A8 demo account | Steps and Review Notes in APP_STORE_SUBMISSION_CHECKLIST.md §3 and §6 | **(You)**: must be created in the app; I can't create accounts in production |

## Detailed findings

### 1.2 — User-generated content

| # | Requirement | Current implementation | Status | Severity | Required fix | Evidence |
|---|---|---|---|---|---|---|
| A1 | Act on objectionable content within 24 hours (the in-app Terms promise this) | Reports land in `public.reports` (status `open`). No moderator alert, no review tool, no way to hide a post or comment. "Removal" means deleting rows by hand in the Supabase dashboard. | **Fail** | Critical | Moderation workflow: alert on each new report (email or webhook), a reviewer RPC or admin path to hide content and suspend accounts, and a status trail on `reports`. | `20261018000003_rls.sql` L315–330 ("Review happens with the service role in the Supabase dashboard"); no `hidden`, `removed` or `banned` columns in any migration. |
| A2 | Remove offending users ("users who posted it may be removed") | No suspension or ban mechanism. A banned person could keep signing in and posting. | **Fail** | High | `profiles.suspended_at`, with RLS and RPCs refusing writes from suspended accounts and hiding their content. | `grep banned` across migrations returns nothing. |
| A3 | A way to filter objectionable content | None. No text filter on titles, reviews, comments or bios, and no image screening. | **Fail** | High | Server-side text check (blocklist trigger) on posts, comments and profiles, plus automatic hiding once a post gets enough independent reports. Image screening is documented as a later step. | `grep -i "profan\|moderat"` finds only Terms text. |
| A4 | Report posts, comments and accounts | Report sheet for post (post menu), comment (long-press menu) and account (profile menu), with reasons and details. Reporters see only their own reports. | **Pass** | — | — | `ReportSheet.tsx`; `post/[id].tsx` L123–126; DB tests "users can file reports but only see their own" and "reports must reference their target…". |
| A5 | Block abusive users, and published contact info | Block and unblock from profile and post menus, with a Blocked list in Settings. Blocking removes follows both ways and hides content and comments in both directions. **No developer contact in the app:** `SUPPORT_EMAIL = null`, so Terms and Settings show none. | Block **Pass**; contact **Fail** | High | Set `SUPPORT_EMAIL` (for example hello@cheffy.me, once Email Routing is on) and show it in Settings and Terms. | `constants/app.ts`; DB tests "blocking removes follows both ways…", "hides comments from blocked users". |
| A6 | Users agree to terms (EULA) with zero tolerance for abuse | Sign-up requires ticking "I agree to the Terms of Use and Community Guidelines, including zero tolerance…". Agreement isn't recorded on the server. | **Partial** | Medium | Store `terms_accepted_version` and the timestamp on the profile. | `sign-up.tsx` L92; `schemas.test.ts`. |

### 2.1 — App completeness

| # | Requirement | Current implementation | Status | Severity | Required fix | Evidence |
|---|---|---|---|---|---|---|
| A7 | A reviewable, crash-free build | Builds 3–5 are development builds, which need a dev server to load, so Apple can't review them. No `production` profile build has been made. | **Fail** | Critical | `eas build --profile production` with production env vars, tested on TestFlight. | `eas build:list` shows only `development-device`. |
| A8 | A demo account for review, with content | None. Review needs a signed-in account with posts, follows and something to report or block. | **Fail** | High | Create a dedicated reviewer account (not real users' data) and give its credentials in Review Notes. | — |
| A9 | Every feature works without hidden dependencies | Contacts and clipboard are guarded for old builds. Push needs a production APNs setup ("Push Notifications are set up" during build 5). The download link is unset ("Coming soon"). | **Manual** | Medium | Full walkthrough on a production TestFlight build. | Build 5 log. |
| A10 | No placeholder content | The website shows "Coming soon" until `DOWNLOAD_URL` is set; the app has none found. | **Manual** | Low | Set the TestFlight or App Store link. | `web/site.js`. |

### 4.8 — Login services

| # | Requirement | Current implementation | Status | Severity | Required fix | Evidence |
|---|---|---|---|---|---|---|
| A11 | Sign in with Apple if third-party login is offered | Email and password only (Supabase Auth) | **Pass (N/A)** | — | Add Sign in with Apple only if Google or another social login is added. | `features/auth/api.ts`. |
| A12 | Working sign-up, verification and recovery | PKCE flow; confirmation link via `https://cheffy.me/auth/callback` opens the app (Universal Links); resend with 60s cooldown; expired-link handling; password reset via the same callback. | **Pass** (sign-up and verify); **Manual** (password reset) | — | Test password reset on a device. | Device test 2026-10-22, build 5; `cooldown.test.ts`. |
| A13 | Reliable email delivery at launch volume | Supabase's built-in email sender, limited to a few emails an hour and not meant for production. | **Fail** | High | Custom SMTP (for example Resend) with SPF and DKIM on cheffy.me. Needs your Dashboard access. | `config.toml` (`email_sent = 2` locally); the live setting must be read in the Dashboard. |

### 5.1 — Privacy and data

| # | Requirement | Current implementation | Status | Severity | Required fix | Evidence |
|---|---|---|---|---|---|---|
| A14 | In-app account deletion (5.1.1(v)) | Settings → Delete account, with two-step confirmation. Deletes all post and avatar files, then calls `delete_account()`, which deletes the login. Profile, posts, comments, likes, follows and collaborations cascade. | **Partial** | High | Do file cleanup on the server (Edge Function with the service role, or a cleanup job), so deletion can't leave photos behind if the app crashes or a modified client skips that step. | `profile/api.ts` L151–162; DB test "delete_account removes the user and everything they own"; live check finds 0 orphaned files. Deleting @audfrog on 2026-10-21 left no rows or files. |
| A15 | Privacy policy link in the app and in App Store Connect | https://cheffy.me/privacy is live. The app has **no link** to it; Settings has Terms (in-app) only. | **Fail** | High | Add Privacy Policy and Terms links in Settings (and sign-up) to cheffy.me. | `curl` 200 for /privacy/; `grep privacy settings.tsx` finds none. |
| A16 | Permission purpose strings | Photos, camera, save-to-photos and contacts each have a clear purpose string. Notifications are asked after an in-app explanation. No location use. | **Pass** | — | — | `app.json` infoPlist and plugin configs. |
| A17 | Contacts never uploaded | Read on the device only; each invite is sent by the user through Messages or the share sheet. | **Pass** | — | Declare in App Privacy that contacts are not collected. | `deviceContacts.ts`, `invite-contacts.tsx`. |
| A18 | Private content stays private | Post photos are in the private `post-images` bucket and readable only by people who can see the post. Post, comment and like visibility is enforced by RLS. Avatars are in a **public** bucket (unguessable URLs), as on most social apps. | **Pass** (posts); avatars **Low** risk | Low | Optional: serve avatars of private accounts through signed URLs. | DB tests in `visibility.test.ts` (storage), `privacy.test.ts`. Live: `post-images.public=false`, `avatars.public=true`. |
| A19 | Signed-out access to data | A signed-out client is refused on every table, RPC and storage listing. | **Pass** | — | — | Live probe 2026-10-22: 14 tables and 4 RPCs return `42501 permission denied`; storage list returns `[]`. |
| A20 | No secret keys in the app | The app reads only `EXPO_PUBLIC_SUPABASE_URL` and the publishable key (`sb_publishable_…`). `.env*` is gitignored. No secret or service-role key in git. | **Pass** | — | — | `git grep` for secret key patterns; key prefix check. |
| A21 | App Privacy "nutrition label" | Not filled in yet. Data collected: email, user content (photos, text), identifiers (user ID), and the push token. No tracking or ads. | **Manual** | High | Complete it in App Store Connect to match the privacy policy. | — |

### Other review items

| # | Requirement | Current implementation | Status | Severity | Required fix | Evidence |
|---|---|---|---|---|---|---|
| A22 | Age rating | Not set. UGC with free text and photos needs the user-generated-content answers, which likely means a 13+ rating, and reporting and blocking must be described. | **Manual** | Medium | Answer the age-rating questionnaire. | — |
| A23 | Support URL | https://cheffy.me works, but its "Contact us" goes to hello@cheffy.me, **which doesn't receive mail yet**. | **Partial** | High | Set up Cloudflare Email Routing for hello@cheffy.me, then use cheffy.me as the Support URL. | Footer links in `web/`. |
| A24 | Encryption export answer | `usesNonExemptEncryption: false` | **Pass** | — | — | `app.json`. |
| A25 | Production database plan | Postgres 17, 60 max connections, 15 MB. The plan tier isn't confirmed; free projects pause after a week of inactivity. | **Manual** | High | Confirm the plan (Pro recommended for launch: no pausing, daily backups). | `pg_settings` query. |

## What's verified well

- 161 database tests run the real migrations with row-level security enforced, as multiple
  signed-in users and signed-out callers. They cover visibility, private accounts, blocks,
  reports, notifications, push tokens, collaborations, rankings, unlocks, storage and account
  deletion.
- Email verification and Universal Links were tested end to end on a physical iPhone
  (build 5).

## Recommended fix order (milestones)

1. **Compliance basics (small):** A5 support contact, A15 privacy and terms links, A6 terms
   record.
2. **Moderation (main work):** A1, A2 and A3. Report alerts, hide content, suspend accounts,
   text filter, automatic hiding at a report threshold, with DB tests.
3. **Deletion hardening:** A14, with server-side storage cleanup.
4. **Release:** A7 production build, A8 demo account, A13 SMTP, A23 email routing, A25 plan.
   Then App Privacy, age rating and Review Notes in APP_STORE_SUBMISSION_CHECKLIST.md.
5. **Then** the security, scalability and load-testing phases, run against a separate staging
   project. Synthetic data never goes into production.
