# Cheffy — Implementation Plan

Each milestone ends with: typecheck, lint, tests, PROGRESS.md update.

## M1 — Foundation
- Expo SDK 58 project, strict TS, ESLint, Prettier, Jest (app + db projects)
- Design tokens and UI primitives (see DESIGN_SYSTEM.md)
- Expo Router structure: root guards, auth stack, tabs with custom tab bar
- Supabase migrations: schema, RLS, RPCs, storage, taxonomy + PGlite test harness

## M2 — Auth & profiles
- Supabase client with encrypted session storage, AppState-aware refresh
- Welcome, sign up (terms acceptance), sign in, forgot/reset password, email callback
- Onboarding: username (live availability), display name, avatar, bio
- Edit profile, sign out, delete account

## M3 — Create
- Compose modal: photos (multi-select, reorder, remove), name, category, rating,
  review, tags, expandable details (category-specific fields), visibility
- Image pipeline: resize, thumbnails, upload with progress and retry
- `save_post` RPC; drafts; edit; delete

## M4 — People
- User search, profiles of others, follow/unfollow, followers/following lists

## M5 — Feed & interactions
- Following feed (cursor), PostCard with carousel, optimistic like/save
- Post detail with comments (add, delete), share link

## M6 — Diary & rankings
- Profile diary grid with category filters
- Rankings tab: filters, sorts, ranks; friend rankings from profiles

## M7 — Discover & collections
- Discover sections from real data; search (people / creations / tags); browse grid
- Saved posts; collections (create, edit, delete, add/remove posts)

## M8 — Hardening & release prep
- Block / report flows, blocked list, terms & guidelines screen
- Accessibility pass (labels, roles, Dynamic Type limits, hit targets)
- Performance pass (FlashList sizing, image cache keys, memoization)
- EAS config, app icon/splash, permission strings, privacy manifest notes
- Docs: SETUP.md (Supabase + Apple), ACCEPTANCE_TEST.md

## Verification approach

| Layer | How |
| --- | --- |
| Database rules | `npm run test:db` — PGlite runs the real migrations; RLS tested with real roles |
| Pure logic | Jest unit tests (validation, formatting, cache helpers) |
| Components | React Native Testing Library |
| End-to-end | Two-device acceptance test on a real Supabase project (manual, documented) |

## R1 — UI/UX refinement & social feed redesign (2026-10-20)

Constraints: keep the identity (cream, oxblood, editorial), no schema changes
beyond `posts.story`, no mock data, no regressions.

1. **Headers** — one `AppHeader` with variants: `brand` (Home: logo, search,
   activity), `large` (Discover, My Rankings: title + actions), `nav`
   (pushed screens, Profile "@username", Create). Remove `TabHeader`.
   Activity inbox from real likes/comments/follows; unread dot tracked locally.
2. **Feed** — information-first entry card: creator → title + rating →
   category/date → inset, balanced photos (1 = 4:3, 2–3 = mosaic) → review →
   tags → "Liked by …" (real likers) → actions. Following / For You switch
   (`feed_posts` / `discover_posts recent`). Compact modules: "Cooking lately"
   (people you follow who posted recently) and "Top rated this week".
3. **Discover** — compact category tiles with real cover photos (latest post
   per category, icon fallback), data-backed sections only, low-content empty
   state with actions.
4. **Rankings** — "My Rankings" header with sort control, stats summary
   (creations, average, top category) from the user's own ratings, larger
   thumbnails and rating badges.
5. **Create** — photo → name → category → rating → review, then collapsible
   Tags / Story / More details rows; tighter spacing; full-screen modal
   instead of the stacked card sheet.
6. **Profile** — "@username" + settings header, refined hierarchy under the
   burgundy card, easy Diary / Rankings / Collections navigation.
