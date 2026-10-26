# Cheffy moderation — admin guide

## Where it is

- **Dashboard:** `https://cheffy.me/admin/moderation/`. It is a static page (`web/admin/`) served by
  the same Cloudflare Worker as the website.
- **Who can use it:** only accounts listed in `public.moderators`. Anyone can load the page, but
  every action and every read goes through database functions that check
  `public.is_moderator()` on the server. Non-moderators get "moderators only" and the page
  signs them out.
- **Sign-in:** use your normal Cheffy email and password. The session lives in that browser
  tab only (sessionStorage). It refreshes automatically and signs you out after 30 minutes
  idle or when you click Sign out.
- **The app:** Settings → Moderation still exists in the app for moderators, for quick
  actions on the go.

## Provisioning a moderator (owner only)

Moderators can't be added from the app, the dashboard or any API: `public.moderators` has
no client grants. Add one in the Supabase SQL editor while signed in as the project owner:

```sql
-- Look the account up by username and check it's the right person first.
select id, username, display_name from public.profiles where username = 'their_username';

insert into public.moderators (user_id) values ('<that id>') on conflict do nothing;
```

**Removing a moderator:** `delete from public.moderators where user_id = '<id>';`. Their past
actions stay in the log.

**Current moderators:** @chefshin (set up earlier at your request).

**Recommended:** turn on multi-factor authentication for every moderator account once the
app supports it. Until then, use a strong unique password and don't share accounts.

## The queue

- **Opening view:** "Needs attention", meaning Pending plus Under review. Urgent reports come
  first, then the oldest, so nothing waits behind newer reports.
- **Overview cards:** Pending, Urgent, Over 24 hours, Under review, Resolved and Dismissed.
  Click one to filter.
- **Filters:** status, type (post/comment/profile), reason, priority, date range, and search by
  report ID prefix, content text or username.
- **Badge:** the pill next to your email and the browser tab title (`(3) Cheffy moderation`)
  show the pending count. They refresh every minute, and a toast appears when a new report
  arrives while the page is open.

| Status shown | Stored as | Meaning |
|---|---|---|
| Pending | `open` | Not looked at yet |
| Under review | `reviewed` | A moderator is on it |
| Resolved | `actioned` | Handled; content removed or account suspended where needed |
| Dismissed | `dismissed` | No violation; content left alone |

**Priority** is computed in the database (`public.report_priority`):
- **Urgent:** the reason is harassment or inappropriate content, *or* two or more people
  reported the same thing, *or* the content is already hidden.
- **Low:** spam or "not homemade" from a single reporter.
- **Normal:** everything else.

**Overdue:** an active report older than 24 hours. The Terms promise review "typically within
24 hours".

## Reviewing a report

The detail page shows:

- **As reported:** a copy of the content taken when the report was filed (text and photos),
  so editing or deleting it afterwards doesn't erase the evidence. If the author deletes
  their account, the copy is removed to keep the Privacy Policy's promise. The report row
  itself stays.
- **Now:** the content as it currently is, including whether it's hidden.
- **Photos:** private and removed posts are visible to moderators only, through links that
  expire after 5 minutes.
- **The report:** reason, the reporter's explanation, when it was filed, and who reviewed it.
  **The reporter's identity is never shown.**
- **Author:** account age, number of posts and removed posts, and how many reports there are
  about them.
- **Other reports on the same content**, and the full **moderation history**.

### Actions

| Button | What it does | Reversible |
|---|---|---|
| Start review | Pending → Under review, so others know you've got it | Yes |
| Remove content | Hides the post or comment from everyone but its author. Nothing is deleted. Resolves every open report about it. Asks you to type REMOVE and give a reason. | Yes (Restore) |
| Confirm removal | For content hidden automatically: makes it a moderator decision with your reason | Yes |
| Restore content | Makes removed content visible again | Yes |
| Suspend account | Profile reports only. Signs the person out, blocks sign-in, and hides their posts and comments. Asks you to type SUSPEND and give a reason. Moderators can't be suspended this way. | Yes (Unsuspend) |
| Resolve | Closes as handled, with no content change | Reopen |
| Dismiss | Closes as no violation | Reopen |
| Reopen | Back to Pending. Needs a note. | — |
| Add note | Internal note in the history, visible to moderators only | — |

- **No permanent deletion:** moderators can't delete posts, photos or accounts from the
  dashboard. Account deletion stays with the user.
- **Conflicts:** each change is checked against the status you were looking at. If another
  moderator changed the report first, you get "Someone else changed this report" and the
  page reloads, so nothing is silently overwritten. Repeating the same change is harmless.

## Audit trail

Every action is written to `public.moderation_actions`:
- who did it;
- what they did;
- when;
- which report and which content it concerned;
- the status before and after;
- the note.

The log is **append-only**. A trigger rejects edits and deletes, even from the database owner
in the SQL editor. The only change allowed is the moderator column becoming empty if that
moderator deletes their own account. App users have no access to it at all.

## Alerts

The queue in the dashboard is the source of truth. Alerts only tell you to look; a failed alert
never loses or blocks a report.

1. **Dashboard badge and tab title.** These work as soon as the dashboard is deployed.
2. **Email to every moderator** through the `moderation-alert` Edge Function. Each report
   sends one email. The email contains only the pending count and a link, never the reported
   content or the reporter. Setup (owner):
   ```sh
   # 1. Secrets (in a terminal; never in the app or git)
   npx supabase secrets set RESEND_API_KEY=<Resend API key with send access for cheffy.me>
   npx supabase secrets set MODERATION_ALERT_SECRET=<random string, 32+ characters>
   # 2. Deploy (JWT verification stays on; the trigger sends the legacy anon key, which is a JWT)
   npx supabase functions deploy moderation-alert --use-api
   ```
   ```sql
   -- 3. Point the database at it (SQL editor)
   insert into public.app_config (key, value) values
     ('moderation.alert_function_url', '"https://yqzycfujpzibzkkdybyu.supabase.co/functions/v1/moderation-alert"'),
     ('moderation.alert_function_auth', '"<legacy anon key — the eyJ… JWT, not sb_publishable_…>"'),
     ('moderation.alert_secret', '"<same MODERATION_ALERT_SECRET>"')
   on conflict (key) do update set value = excluded.value;
   ```
   - **Check it works:** file a test report from a test account, then confirm the email
     arrives and the dashboard shows the report.
   - **If sending fails:** the report's alert claim is released and the report stays in the
     queue.
   - **Legacy keys:** if the legacy keys are ever disabled, the gateway will reject the
     trigger's call. The function checks its own 32+ character secret, so deploying it with
     `--no-verify-jwt` would then be safe. That changes authentication, so it's your call.
3. **Optional Discord or Slack** webhook (`moderation.alert_webhook`), as before. The message
   contains no reporter identity.

## Reporting pipeline (for reference)

- **Filing a report:** the app inserts into `public.reports` (`src/features/social/api.ts`,
  `reportContent`).
  - Row-level security only lets you file as yourself, and you can only read your own
    reports.
  - Column grants stop reporters from setting the status or any review field.
  - A before-insert trigger checks that the target exists and matches the type, then saves
    the evidence copy.
  - One active report per person per target is allowed. Reporting the same thing again shows
    "Thanks" without creating a duplicate.
- **After insert:** `reports_after_insert` hides content reported by three different people
  (`moderation.auto_hide_reports`) until review, then sends alerts.
- **Removed content:** removed posts drop out of every feed, Discover section, ranking and
  profile for everyone except their author. Hidden comments are visible to their author only.

## Testing

- **Database:** `tests/db/moderation-dashboard.test.ts` and `tests/db/moderation.test.ts` run
  against an in-process Postgres with the real migrations and row-level security. They cover:
  - non-moderators rejected from every function;
  - evidence kept, then scrubbed when the author deletes their account;
  - de-duplication;
  - priorities and overdue flags;
  - the review workflow and the history it writes;
  - idempotency and conflict detection;
  - remove and restore without deleting anything;
  - the suspend safeguard;
  - the append-only log;
  - alert claims;
  - moderator-only photo access.
- **Dashboard UI:** tested locally against mocked responses, including an HTML-injection
  payload, which rendered as text. It has not yet been tested against production, which needs
  the migration pushed and a moderator sign-in.
