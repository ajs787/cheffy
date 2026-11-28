# Database reliability report (Phase A)

2026-11-28 · branch `comment-reliability` · evidence read-only from the live project
(`yqzycfujpzibzkkdybyu`). No production data, settings or schema were changed.

## Summary

The "comments fail when 4–5 people are active" problem is **not** caused by comments,
connection limits or locks. It is caused by **bursts of heavy read queries from the Discover
screen** on a small database. When a few people open Discover around the same time, dozens of
heavy queries queue up, statements hit the 8-second timeout, and anything caught in that
window fails, including other people's comment inserts.

| Status | Item |
| --- | --- |
| COMPLETE AND VERIFIED (logs) | Diagnosis of the 2026-11-28 01:53 UTC failure burst |
| IMPLEMENTED BUT NOT FULLY VERIFIED | Discover burst cap, duplicate-request fix, retry-safe comments (unit tests pass; not measured in production or on a device) |
| BLOCKED | Concurrency load tests (no staging project exists) |
| NOT STARTED | Database-side query optimization (needs a migration and your approval) |

## Evidence

**Instance:** `max_connections` 60, `shared_buffers` 224 MB, statement timeout 8 s for
signed-in users (3 s anon), lock timeout 8 s. Data is small: 173 posts, 52 profiles,
534 likes, 297 comments, 1,163 notifications.

**Gateway logs, 7 days (2026-11-21 → 11-28):** about 8,900 requests, 6,721 from build 16 (1.1.0).
Errors:
- 4 × HTTP 500: 3 × `rpc/discover_posts`, 1 × `POST /comments`. All on 11-28 between
  01:53:38 and 01:54:23 UTC.
- 90 × HTTP 401 on build 16, spread across reads (expired access tokens; see below).
- 1 × 409 on `likes` (a duplicate like, handled).

**Postgres logs, same window:** 5 × "canceling statement due to statement timeout", all at
01:53:53–01:54:36 UTC on 11-28. No deadlocks, no "too many connections", no lock timeouts.

**The burst (01:53:38 UTC):** one app opened Discover and fired **13 `discover_posts` calls in
the same second**, alongside `trending_taxonomy`, `new_members`, `get_rankings` and others. Two
of the 13 failed with 500. Ten seconds later (01:53:48) another person's comment insert failed
with 500, then the statement timeouts were logged. The same 13–16-call pattern shows up every
time Discover opens (e.g. 01:45:14 and 01:45:43).

**Query cost (`pg_stat_statements`, since 2026-10-25):**

| Query | Calls | Mean | Max |
| --- | --- | --- | --- |
| `discover_posts` (main shapes) | 4,253 / 1,365 | 387 / 467 ms | 2.1 / 5.9 s |
| `taste_posts` | 147 | 1,476 ms | 3.1 s |
| `taste_topics` | 131 | 1,151 ms | 2.3 s |
| `trending_taxonomy` | 217 | 1,082 ms | 4.5 s |
| `profile_stats` | 3,103 | 58 ms | 5.7 s |
| `get_rankings` | 1,793 | 89 ms | 6.2 s |
| Realtime change polling | 1.62 M | 5.9 ms | 11.8 s |

These are slow for so little data: most of the cost is per-row RLS checks (`can_view_post()`)
and PostgREST embeds. Realtime polling is the largest total (9,501 s) but averages about 0.3%
of one CPU. It is not what caused the bursts. Only `notifications` is in the Realtime
publication, which is already narrow.

## Root causes

1. **Discover fans out.** Each open runs one `discover_posts` per row: 4 fixed rows, up to
   4 trending rows, 3 category tiles (each fetching 10 full posts just for one cover photo)
   and the "Just posted" grid. With Most Hated, two "For your taste" calls, trending and
   suggested people, that's 15–17 heavy queries at once.
2. **Each of those queries is slow** (0.4–1.5 s average) on a small instance, so a few
   simultaneous Discover opens queue past the 8 s statement timeout.
3. **Comment failures were collateral.** The only failed comment insert in 7 days happened
   inside that queue. Comment inserts themselves are fast.
4. **Comment sends weren't retry-safe.** A response lost after the server saved the comment
   (likely during exactly these slowdowns), followed by a resend, would post it twice.
5. **Duplicate requests.** Every notification refresh fetched the unread count twice, because
   `['activity']` is a prefix of `['activity', 'unread']`.

Ruled out by the evidence: connection exhaustion, lock contention or deadlocks, database
restarts, rate limiting, notification fan-out, and Realtime subscription count.

## Changes in this branch (app only, no migration)

- **Discover burst cap:** Discover's rows load at most 3 at a time per app
  (`src/utils/concurrency.ts`, used by `useDiscoverSection`). One Discover open now puts
  3 row queries on the database at a time instead of ~13. "Just posted" and Browse grids
  skip the queue so what people scroll isn't delayed.
- **Category tiles** fetch 5 posts instead of 10 (only the cover is shown).
- **Discover rows** stay fresh 5 minutes instead of 2 (they cover weeks of posts).
- **Unread count** fetched once per refresh (`exact: true` on the activity invalidations).
- **Retry-safe comments:** after a failed send, resending the *unchanged* draft first looks for
  a comment you already saved on that post since the first attempt (same text, thread and
  attachment, and never at or before your last successful comment) and uses it instead of
  inserting again. If the list already shows it, the placeholder is dropped instead of
  showing it twice. A first send, or an edited draft, has no extra lookup.

  **Known limit:** if the first insert is still queued on the server when you resend (the
  app gives up after 20 s, the server may still finish), both can be saved. Closing that gap
  needs a database idempotency key: a migration plus an INSERT grant on that column.

  Why not a client-chosen id: `comments` grants INSERT on specific columns only (not `id`).
  A DB test caught this before it shipped. A cleaner idempotency key needs a migration.
- Existing comment UX already met the brief: an immediate sending state, the send button
  disabled while sending, the draft kept on failure with a clear message, optimistic display
  reconciled with the server row.

## Independent review

A read-only security reviewer found no issues. A read-only quality reviewer found 7 issues.
Six are fixed:
- false reuse of an older identical comment;
- the same comment shown twice after a refetch;
- a race in the limiter;
- grids queued behind rows;
- reply-target and edit changes;
- the lookup failing on very long comments.

The cover-photo fallback was moved to 5 posts. The in-flight duplicate is the known limit above.

## Recommended next steps (need your approval)

1. **Optimize the Discover queries in the database** (migration). Options:
   - one `discover_home` RPC that returns all rows' first items in a single call;
   - cheaper visibility checks for public posts;
   - indexes for the `top` / `loved` sorts within a time window.

   Measure with `EXPLAIN ANALYZE` in a staging copy first.
2. **Staging project for load tests.** The brief's 5/10/25/50-user tests must not run against
   production. A Supabase branch or a second project with representative data is needed. It
   may cost money.
3. **Compute size.** The instance is very small. A larger compute tier is an option, but it
   only hides the burst. Do it after (1), if at all.
4. **401s:** 90 requests carried expired tokens. supabase-js refreshes on foreground, but
   requests that fire first still fail. Retrying once after a token refresh would remove most of these.

## How this was checked

- Read-only: `supabase logs` (gateway, Postgres and Storage, per day), `pg_stat_statements`,
  `pg_settings`, role settings, publication tables, row counts.
- Tests: the full suite (typecheck, lint, app and PGlite DB tests). See PROGRESS.md for results.
- Not checked: device behaviour of the new code, or production load after the change (not
  released).
