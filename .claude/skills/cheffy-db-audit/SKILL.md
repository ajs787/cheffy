---
name: cheffy-db-audit
description: Review and verify a Cheffy Supabase migration, RPC, RLS policy, storage policy or query change before it goes live. Use whenever supabase/migrations or a feature api.ts query changes, before asking to push a migration, or when the user says /cheffy-db-audit.
---

# Cheffy database audit

Verifies database changes locally and read-only. It never writes to production.

## 1. Inventory
- `git diff main...HEAD --stat -- supabase tests/db src/features` lists what changed.
- `npx supabase migration list --linked`: only this branch's new migrations may be pending.
  Anything else pending means stop and tell the user.

## 2. Migration review (read every new SQL file)
Check each item and note the answer:
- **Additive?** Any drop, rename, type change, `delete`/`update` of existing rows or
  `not null` on an existing column is destructive and needs the owner's approval. Say so.
- **Old clients:** would the 1.0 app (still in use) break? Old RPC signatures stay working.
- **RLS:** every new table has `enable row level security` and policies. Selects go through
  `can_view_post()` or the parent post. Blocks, private accounts, suspensions, removed posts
  and anonymity hold.
- **Functions:** `security definer` + `set search_path = ''`, checks `auth.uid()`,
  `revoke ... from public, anon` and `grant execute ... to authenticated` only, input length
  and limit caps.
- **Concurrency:** unique constraints or `on conflict` instead of check-then-insert. Counters
  updated by triggers.
- **Performance:** every new filter, join or sort has an index. Lists are keyset-paginated and
  capped. No unbounded scans over posts, likes or comments.
- **Storage:** buckets private, object policies tied to ownership or `can_view_post()`.

## 3. Tests (required)
- A `tests/db/<feature>.test.ts` covers the allowed and denied cases for each role that
  matters (author, follower, stranger, blocked user, signed out).
- `npm run test:db` must pass. It applies every migration to PGlite, so it also checks that
  the migrations apply cleanly in order.

## 4. Live baseline (read-only)
`npx supabase db advisors --linked --type all -o json`, compared with the baseline (2026-11-28):
- 0 errors.
- 64 × `authenticated_security_definer_function_executable`. Expected: Cheffy's RPCs are
  definer functions on purpose.
- `extension_in_public` (pg_net), `auth_leaked_password_protection`, `duplicate_index`
  (`comments_author_created_idx` / `comments_author_recent_idx`).

Any new error, or a new warning other than an intended new RPC, is a finding. After a push,
run it again. Live data checks use `npx supabase db query --linked --read-only` only.

## 5. Security review
For RLS, RPC, storage or auth changes, send the diff to the `cheffy-security-reviewer`
agent and check its findings yourself.

## Done when
Every checklist item is answered, `npm run test:db` passes, advisors show nothing new and
unexplained, and confirmed findings are fixed. Report a short summary and ask the owner
before `supabase db push`. Never push, run write queries, or change flags without their
explicit yes.
