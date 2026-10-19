# Cheffy — Progress

_Last updated: 2026-10-18_

## Summary

The full MVP is implemented in code: all eight milestones are written,
typechecked, linted and unit/integration-tested. **It has not yet run against a
real Supabase project**, because one doesn't exist yet (it needs your account; see
SETUP.md §1). The two-device acceptance test is therefore **not run yet**.

| Milestone | Code | Verified by |
| --- | --- | --- |
| M1 Foundation (setup, design system, navigation) | ✅ | Typecheck, lint, component tests, simulator render |
| M2 Supabase, auth, profiles | ✅ | Schema/RLS tests (PGlite); auth/onboarding UI rendered in simulator; **live auth not run** |
| M3 Create post, photos, ratings, categories | ✅ | `save_post` RPC tests, form/payload tests, RatingInput tests; **photo upload not run live** |
| M4 Search, follow, friends' profiles | ✅ | RLS/follow tests; **not run live** |
| M5 Feed, likes, comments | ✅ | Feed RPC, counters, visibility, optimistic cache tests; **not run live** |
| M6 Diary, rankings, filtering | ✅ | Ranking RPC tests (tie-break, filters, sorts, visibility) |
| M7 Discover, collections, saved | ✅ | Discover/search/trending RPC tests, collection RLS tests; **not run live** |
| M8 Safety, moderation, release prep | ✅ (partial) | Block/report RLS tests; EAS config, icon, docs. Accessibility and performance passes on a device are still to do |

## What was verified, and how

- **`npm run check`**: TypeScript strict ✅, ESLint (including React Compiler
  rules) ✅, **150 tests across 18 suites ✅**.
  - `tests/db/*` (76 tests) run the **real migrations** in PGlite (Postgres 18,
    WASM) with Supabase's `auth`/`storage` stubbed. Queries run as the
    `authenticated` role with a JWT `sub`, so RLS is really enforced. Covered:
    profile rules, post create/edit/delete ownership, forged author/counters,
    validation, drafts, taxonomy validation, image/tag limits, public/followers/private
    visibility for posts, child rows **and storage objects**, follows, likes
    (unique, counters), comments (moderation by post author), saved posts,
    collections, blocking (hides both ways, removes follows), reports,
    account deletion cascade, anon lockout, rankings (deterministic tie-break,
    filters, sorts, pagination, friend visibility), feed (keyset pagination),
    discover/search/trending/suggestions.
  - App tests (74): rating math and parsing, dates/format helpers, auth/profile/post
    schemas, save payload (clears stale category fields), taxonomy logic,
    cache helpers (optimistic like/save rollback, delete, block), route gate,
    RatingInput / AppButton / LikeButton component behavior.
- **iOS Simulator (iPhone 16, iOS 18.5, Expo Go 58)**: the app bundles and
  launches. Welcome and Sign-up screens render as designed (fonts, palette,
  layout). Screens behind sign-in were **not** viewed because there's no backend yet.
- **Bug found and fixed by the tests:** the profile visibility policy read
  `user_blocks` through its own RLS, so a blocked user could still see the
  blocker's profile. It's now a security-definer `has_blocked()` check.
- **Bug found and fixed by the simulator:** signed-out launch hit "Unmatched
  route" at `/`. Added a root gate route; Home moved to `/home`.

## Live testing (2026-10-18/19, real Supabase project, iPhone 16 simulator)

Verified end to end against the live database:
- Migrations applied (`supabase db push`); anon is refused on every table and RPC.
- Sign-up → onboarding → Home empty state; session survives an app restart.
- Create: name, Drinks → Matcha (live taxonomy), exact rating 9.2, two photos,
  review, tags → **Post**. Photos resized, uploaded to the private bucket,
  saved via `save_post`; "Logged to your diary".
- Feed card (carousel, 9.2 badge, category line, tags), post detail, like
  (count 1), comment (posted and listed), facts card.
- Profile header counts (1 creation, Drinks 1), Diary grid thumbnail,
  Rankings (#1 with filter chips from real usage), Discover empty state.

Bugs found live and fixed:
1. Photo picker never opened from the action sheet → actions now run after the
   sheet's modal reports `onDismiss`.
2. Keystrokes dropped in controlled text fields → name, review and tags are
   uncontrolled; Create mounts only once its initial values are known.
3. Uncommitted tag text lost on Post → included on submit; tags commit on
   return/blur/suggestion (live comma-splitting raced typing and garbled tags).
4. A save could spin forever after the device slept (React Query thought it
   was offline) → connectivity is re-read on foreground, and Create shows
   "Waiting for a connection…" while a save is paused.
5. PKCE fell back to `plain` + Math.random (no WebCrypto) → expo-crypto shim
   for `getRandomValues` / `subtle.digest`. *Confirm the Supabase warning is
   gone on the next sign-in.*
6. Polish: "What kind?" label, "Your followers", ghosted 0.0 placeholder,
   exact-rating placeholder, header spacing.

## Not verified yet

1. Live, not yet exercised: follow/unfollow, search, collections, saved,
   edit/delete post, block/report, account deletion, password reset and
   email-confirmation deep links.
2. Two-device acceptance test (`docs/ACCEPTANCE_TEST.md`) — needs a second account.
3. Keyboard avoidance inside the modal compose sheet on a real device.
4. Android (code is cross-platform, but nothing has been run on Android).
5. Manual VoiceOver pass and Dynamic Type at the largest sizes.
6. EAS build / TestFlight upload (needs your Apple Developer account).

## Key decisions

- **Security in Postgres.** One `can_view_post()` governs posts and everything
  attached to them, including Storage. Column-level grants stop clients writing
  counters, ownership and publish dates.
- **One post = one attempt.** Rankings are computed (`row_number()`), never
  stored, so comparative ranking can be added without migrating data.
- **Extensible taxonomy.** A single `categories` table with kinds. The Create
  quick-pick is data-driven (subcategories if a primary has them, otherwise
  cuisine).
- **Private photos.** Full image (1440 px) and thumbnail (480 px) are re-encoded
  on device, which also strips EXIF/GPS. They're served by batched signed URLs
  with a stable `cacheKey`.
- **Encrypted session.** AES key in Keychain, ciphertext in AsyncStorage.
- **Light-only for v1.** The warm paper palette is the brand. Tokens allow dark mode later.
- **Expo Go-compatible.** No custom native modules, so two phones can test via
  Expo Go before any Apple account exists.
- **Typed rows at the query boundary** (`fetchRows<T>`) instead of hand-writing a
  full generated `Database` type. Generate real types once the project is linked.

## Known gaps and follow-ups

- Photo reorder uses a tap menu (cover / earlier / later / remove) rather than
  drag-and-drop.
- If a save fails after photos uploaded and the user then discards the entry,
  those files stay orphaned in Storage. Needs a periodic cleanup job.
- Reports are reviewed in the Supabase dashboard; there's no in-app moderation tool.
- `SUPPORT_EMAIL`, a privacy policy URL and custom SMTP must be set before App
  Store submission (SETUP.md §4).
- Future features (comparative ranking, collaborative posts, dish history,
  recommendations, stats, push) are designed for but intentionally not built.
  See ARCHITECTURE.md.

## Next steps

1. Create the Supabase project and apply migrations (SETUP.md §1).
2. Run the app on the simulator with real credentials and walk through every screen.
3. Run the two-device acceptance test with your friend; log results.
4. Fix whatever that surfaces, then do the VoiceOver and performance pass on a device.
5. EAS build → TestFlight.
