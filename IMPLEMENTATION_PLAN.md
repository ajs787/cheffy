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
