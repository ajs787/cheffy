@AGENTS.md

# Cheffy — engineering rules

Cheffy is a live App Store app (Expo SDK 58, RN 0.88, React 19.3, TypeScript strict,
Supabase). Real people's posts, likes and comments are in production. Details live in
[ARCHITECTURE.md](ARCHITECTURE.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md),
[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) and [PROGRESS.md](PROGRESS.md). Read the relevant
one before changing an area.

## Architecture

- `src/app` holds routes only (thin screens). Server state lives in `features/<f>/hooks.ts`
  (TanStack Query), query shape in `features/<f>/api.ts`, mapping in `mappers.ts`.
- `components/ui` is primitives with no data fetching and never imports from `features`.
  `components/shared` holds composed pieces (`PostCard`, `LikeButton`, `UserRow`…).
  Reuse these before writing a new component. Extract only on a second real use.
- Forms use React Hook Form + Zod. Local UI state uses Zustand. No new state library.
- Native modules: the app now uses some (e.g. `expo-paste-input`, guarded with
  `requireOptionalNativeModule`). Expo Go does not prove native behaviour. Native changes
  need a development or TestFlight build and a real-device check.

## TypeScript

- Strict. No `any`, `@ts-ignore`, `eslint-disable` or `!` to silence errors. Fix the type.
- Domain types are camelCase (`src/types/models.ts`). Snake_case rows stop at `mappers.ts`.
- Never delete or weaken a failing test to make a change pass.

## Supabase: security lives in Postgres

- RLS on every table. Visibility goes through `can_view_post()`, and child tables delegate
  to the parent post. Blocks, private accounts, suspensions and anonymity must hold in every
  new query, RPC and notification.
- Multi-table writes go through one RPC. RPCs are `security definer` with
  `set search_path = ''`, check `auth.uid()`, and grant `execute` to `authenticated` only.
- Anonymous takes and likes never expose the author to anyone but the author and
  moderators (no ids in API responses, notifications or counts that reveal them).
- Never a service-role key in the client, `EXPO_PUBLIC_*` vars, or the repo. Edge
  Functions verify the caller's JWT.
- Storage buckets are private. Access goes through policies or signed URLs.

## Database migrations

- New file in `supabase/migrations/` (`YYYYMMDDHHMMSS_name.sql`). Never edit an applied one.
- Additive and backward-compatible: the 1.0 app is still in use. Destructive changes
  (drop, rename, type change, data rewrite) need the owner's explicit approval.
- Every migration gets a PGlite test in `tests/db/` (RLS: allowed and denied cases).
- **Pushing to production (`supabase db push`), changing feature flags or prod config, and
  any write query on the linked project need the owner's explicit yes, every time.**
  Read-only checks use `npx supabase db query --linked --read-only`.

## Performance (500–1,000+ users)

- Paginate (keyset). Select only the columns needed. No N+1: one request per feed page.
- New filters/sorts need an index. Discovery uses bounded time windows, never full scans.
- Counters come from triggers, not aggregates. Thumbnails in lists, originals full-screen.
- No new dependency for something simple. Measure before claiming a speed-up.

## Design

- Tokens come from `@/theme` only (`colors`, `spacing`, `fonts`, `iconSizes`, `strokes`):
  no hex values or magic numbers in components. Text uses `AppText` variants.
- Bodoni Moda for display sizes only (≥ 18pt), Newsreader for everything else.
  Light-only. 44pt touch targets (`hitSlop` where the visual is smaller). Every control
  has an accessibility label.
- Keep existing social features intact: likes (incl. anonymous), "Liked by", comments
  (mentions, photos, stickers, anonymous takes), follows, co-creators, rankings.

## Verification

- `npm run check` (typecheck + lint + all tests, ~2 min) before calling anything done.
  `npm run test:db` for database changes. Report failures; never skip them.
- Don't claim something works without running it. Say what wasn't verified.
- Update PROGRESS.md with what changed, how it was checked, and what's left.

## Git and release

- Work on a branch, never directly on `main`. Commit, push and merge only when asked.
- EAS builds, `eas submit` and `eas update` only when the owner asks. **Never submit to
  App Store Review.** The owner does that.
- Never commit secrets (`.env.local` is ignored). Never enter passwords.
- The simulator's @chefshin account is the owner's real account: no writes without their OK.

## Workflow

Skills in `.claude/skills/`: `cheffy-feature` (feature work end to end), `cheffy-db-audit`
(migrations and RLS), `cheffy-ui-review` (screens), `cheffy-release-check` (before a
build). Read-only reviewers in `.claude/agents/`: `cheffy-security-reviewer`,
`cheffy-quality-reviewer`, `cheffy-ui-reviewer`.
