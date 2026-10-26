# Cheffy security audit — 2026-10-26

**Short version.** The audit found **14 access-control and data-isolation leads** in the database
layer, plus one in the new moderation dashboard. **None is confirmed**: no audit agent ran the app's
code (see "Method" below). All 14 have been **fixed on branch `launch-readiness`**, each with a
regression test. **None of the fixes is live yet.** They ship when you approve pushing
migration `20261026000002_security_hardening.sql` and deploying the website.

The audit found no leaked secrets, no service-role key in the app, and no way for an ordinary user
to become a moderator.

| | |
|---|---|
| Audited commit | `987fde9` (branch `launch-readiness`, moderation dashboard included) |
| Fixes | `20261026000002_security_hardening.sql`, `web/admin/admin.js`, `web/auth/callback.html`, `supabase/functions/delete-account/index.ts` (uncommitted at time of writing, then committed on the branch) |
| Regression tests | `tests/db/security-audit.test.ts` (14 tests). Full suite: 418 tests pass (228 database, 190 app) |
| Full lead write-ups | [docs/security/NEEDS-VALIDATION.md](docs/security/NEEDS-VALIDATION.md) |
| Live database | **Not changed.** The only access was read-only: checking that existing image and avatar paths satisfy the new path rule (0 of 127 images failed, 0 avatars failed). |

## Tools used (and not used)

- **Security-audit skill** (`~/.claude/skills/security-audit`), full-audit mode, `standard`
  profile, budget 56 agents, **54 used**.
  - Reconnaissance: 4 agents.
  - Hunting: 15 hunters over 4 waves, with 5 coverage critics. The final critic found nothing
    left to cover.
  - Validation: 14 candidate verifiers, then 14 record verifiers, plus 1 fresh re-verifier for a
    corrected record.
  - Both of the skill's schema validators pass: 14 findings, 23 coverage units.
  - The run folder is `~/security-audit-skill/cheffy/run-1/`, outside the repo. It holds
    REPORT.md, NEEDS-VALIDATION.md, FINDINGS-DETAIL.md, the ledger and every agent's brief and
    result.
- **Trail of Bits `audit-context-building`** is installed, but I didn't run it. The skill's own
  reconnaissance covered this codebase's size. Nothing in this report comes from it.
- **No external scanners** were downloaded or run, and nothing was probed on the live Supabase
  project or the website.
- **`npm audit`** wasn't run, because it needs the network. Run it before launch (see the
  checklist below).

## Method, and why nothing is "confirmed"

The skill only lets an agent run target code inside a sandbox that limits both memory and run
time. macOS can't enforce those limits, so every audit agent worked **from source only**. Under the
skill's rules, a lead it can't run stays **needs validation**: it gets no severity and isn't called a
confirmed vulnerability.

The fixes then went through a separate development step in the normal test harness (PGlite running
the real migrations with RLS). For each lead, a test was written that **asserts the safe behaviour**,
and the fix makes it pass. That is development evidence. It doesn't change the audit verdicts above.

## Leads and fixes

The order follows the suggested priority. The "Fix" column refers to numbered sections of the
hardening migration; "Test" is the test name in `security-audit.test.ts`.

| # | Lead (needs validation) | Who could do it | Fix | Test |
|---|---|---|---|---|
| 1 | Filing a report copied private, followers-only, draft or blocked content into an evidence snapshot **the reporter could read back** | Any signed-in user who knows a post ID | §5: reporters can read only their report's basic columns, never the snapshot | *reporting a post you cannot see does not reveal its content* |
| 2 | Creating your profile could set **locked cosmetic columns** (theme, frame) and moderation columns | Any signed-in user | §1: profile INSERT limited to ordinary columns | *cannot set unlock-gated or moderation columns…* |
| 3 | Deleting and recreating your own profile row **erased blocks other people had placed on you**, scrubbed report evidence, and could claim a second OG Chef slot | Any signed-in user | §1: clients can't delete profiles. Account deletion still works through the Edge Function. | *cannot delete their own profile row directly* |
| 4 | A suspended user could still **publish an existing draft** until their access token expired (≤ 1 hour) | A suspended user | §2: restrictive UPDATE policy on posts and comments | *a suspended account cannot publish a draft…* |
| 5 | **Blocking a Co-Chef** didn't end their access to the shared post and photos | A blocked collaborator | §4: a block marks the collaboration removed both ways | *blocking a co-chef ends their access…* |
| 6 | A reply could be addressed to **anyone**, sending them a "replied to you" notification and push with the post title | Any signed-in user | §11: the reply target must be in the thread; otherwise it becomes the parent author | *cannot address a reply… outside the thread* |
| 7 | A crafted image path (`../`) could steer the **moderator's signed-URL request** to another Supabase endpoint | A post author, against a moderator | §7: path format rule on images and avatars, and `safePath()` in `web/admin/admin.js` | *rejects image paths with dot segments* |
| 8 | A reported author could **delete or overwrite the photos** held as report evidence | The reported author | §8: storage refuses delete or update of evidence photos while a report is open | *the author cannot delete or overwrite photos held as report evidence* |
| 9 | After a moderator **restored** auto-hidden content, one more report hid it again | Any 1 signed-in user | §6: restoring closes the target's reports | *restoring auto-hidden content is not undone…* |
| 10 | Reporters could read **who reviewed** their report and the internal note | A reporter | §5 (same column grant as #1) | *reporters cannot see who reviewed their report…* |
| 11 | Anyone could ask **whether two other users have blocked each other** | Any signed-in user | §3: helpers answer only for the people involved | *third parties cannot ask whether two other users blocked each other* |
| 12 | `comparison_score` revealed another user's private **ranking choices** for any post | Any signed-in user | §9: returns 0 unless the caller may see the post | *comparison_score does not reveal…* |
| 13 | `collaboration_status` revealed hidden **Co-Chef invitation** states | Any signed-in user | §3 | *collaboration status of other people is not exposed* |
| 14 | `classification_usage` counted **private posts**, revealing activity on one-user custom labels | Any signed-in user | §10: counts public posts of public accounts only | *classification_usage ignores private and followers-only posts* |

### What the fixes deliberately keep

- **Account deletion** still removes everything. It runs as the service role, so evidence photos are
  deleted too, as the Privacy Policy promises. Covered by the existing `delete-account` tests.
- **RLS helpers** (`is_blocked_between`, `has_blocked`, `collaboration_status`) stay callable,
  because policies use them. They now return "not blocked" or "no status" to a caller who isn't
  one of the two people involved.
- **Deleting a reported post** still works. The app already ignores storage-removal errors
  (`posts/api.ts:69`, `save.ts:129`, `profile/api.ts:162`), so the post is deleted and its evidence
  photos stay until a moderator closes the report.

## Other hardening done on the branch

- `web/auth/callback.html` now forwards only `code`, `type`, `error`, `error_code` and
  `error_description` to the app. Before, it forwarded every parameter, including tokens from an
  implicit-flow link. I checked this in the browser: a link with extra tokens forwards only
  `code`.
- `delete-account` now walks storage folders up to 8 levels deep, instead of 2. **This needs a
  redeploy**, which waits for your approval.
- `web/_headers` gives `/admin/*` a strict Content-Security-Policy, `noindex`, `no-store`,
  `frame-ancestors`/`X-Frame-Options: DENY`, `nosniff` and `no-referrer`.

## Remaining risks and recommendations (not fixed)

From the hunters' 59 hardening notes, these are the ones worth acting on. None is a demonstrated
boundary break.

**Supabase dashboard settings (owner):**
- Turn on **Secure password change**.
- Set a **session timebox** or an inactivity timeout.
- Consider **CAPTCHA on sign-up**. Moderators are ordinary accounts with an 8-character minimum
  password, and fake accounts make report flooding cheap.
- If moderators enrol in MFA later, `is_moderator()` should require the JWT `aal2` claim.

**Rate limits:**
- Reports have no per-user cap, so one account can flood the moderation queue.
- Like/unlike toggling sends a new push notification each time.

**Moderation:**
- Clamp `moderation.auto_hide_reports` to at least 2 in the database.
- Make the dashboard's Dismiss and Resolve close every report on the target, as the in-app
  moderation screen does.

**Push:**
- The badge count includes notifications from blocked users.
- Sign-out skips deleting the push token when notification permission has since been turned off,
  so a shared phone could keep getting the previous user's pushes.

**Storage:**
- Signed photo URLs last 2 hours and are cached by the CDN for a year, so a photo can stay
  reachable for a while after being hidden or deleted.
- The avatars bucket is public by design.
- Evidence photos are kept after a report closes. They are removed when the account is deleted.

**Session storage (device):**
- The Keychain key uses `AFTER_FIRST_UNLOCK`, not `…THIS_DEVICE_ONLY`.
- AES-CTR without a MAC is acceptable here, since an attacker would already need access to the
  app's sandbox.

**Supply chain:**
- Run `npm audit`.
- Commit a `deno.lock` for the Edge Functions.
- Pin `wrangler` as a devDependency.

**Existence check:** filing a report on a deleted ID returns a distinct error, which reveals
whether that ID exists. Low value.

## What could not be verified

- **Any runtime behaviour of the 14 leads on the hosted project.** The hosted table privileges could
  differ from the migrations. NEEDS-VALIDATION.md lists safe, read-only SQL the owner can run to
  check each one, for example `has_table_privilege('authenticated','public.profiles','DELETE')`.
- **Hosted Auth settings:** JWT expiry, whether banned users can refresh, and MFA.
- **Cloudflare:** that `_headers` is actually applied to `/admin/*`. Check after deploy with
  `curl -I https://cheffy.me/admin/moderation/`.
- **Whether `net` (pg_net) tables are exposed through the API.** The moderation alert secret
  travels as a request header that pg_net logs.

## Owner approvals needed

1. `supabase db push` applies `20261026000001_moderation_dashboard.sql` and
   `20261026000002_security_hardening.sql`. Both are non-destructive (no rows are deleted), and all
   live data already satisfies the new constraints.
2. Merge `launch-readiness` into main. This deploys the website, the callback fix and the
   dashboard.
3. Redeploy `delete-account`.
4. After deploy, run the read-only checks in NEEDS-VALIDATION.md to confirm the hosted privileges
   match.
