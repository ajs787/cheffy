# Cheffy — Architecture

## Stack

| Concern        | Choice                                                          |
| -------------- | --------------------------------------------------------------- |
| App            | Expo SDK 58, React Native 0.88, React 19.3, TypeScript strict   |
| Routing        | Expo Router (file-based, `src/app`)                             |
| Server state   | TanStack Query v5                                               |
| Local state    | Zustand (compose draft UI state only)                           |
| Forms          | React Hook Form + Zod v4                                        |
| Backend        | Supabase: Postgres, Auth, Storage, RLS. No custom server.       |
| Images         | expo-image (display, caching), expo-image-picker, -manipulator  |
| Animation      | Reanimated 4, Gesture Handler, expo-haptics                     |
| Lists          | FlashList v2                                                    |
| Icons          | lucide-react-native                                             |
| Tests          | jest-expo, React Native Testing Library, PGlite for DB/RLS      |
| Delivery       | EAS Build → TestFlight → App Store                              |

Everything runs in Expo Go during development (no custom native modules), and EAS
builds for TestFlight.

## Folder layout

```
src/
  app/                 Expo Router routes only — thin screens that compose features
    (auth)/            welcome, sign-in, sign-up, forgot-password
    (app)/             signed-in area
      (tabs)/          home, discover, rankings, profile (+ center Create button)
      post/[id]        post detail + comments
      user/[id]        profile of another user
      compose          create / edit modal
      ...
  components/
    ui/                design-system primitives (AppText, AppButton, RatingInput…)
    shared/            composed, app-specific pieces (PostCard, RankingRow…)
  features/<feature>/  api.ts (Supabase calls), hooks.ts (React Query), components/
  lib/supabase/        client, secure session storage, storage helpers
  lib/query/           QueryClient, query keys, cache helpers
  stores/              Zustand stores
  theme/               design tokens
  types/               database + domain types
  utils/               pure helpers (dates, ratings, validation)
supabase/
  migrations/          ordered SQL migrations (schema, RLS, functions, taxonomy)
  seed.sql             local-only; contains no fake users or posts
tests/db/              PGlite harness + RLS / ranking / feed tests
```

Rule of thumb: routes do layout, `features/*/hooks.ts` own server state, `api.ts`
owns the query shape, `components/ui` never import from `features`.

## Data flow

```
Screen ──uses──▶ feature hook (useQuery/useMutation)
                   └──calls──▶ feature api.ts ──▶ supabase-js ──▶ PostgREST / RPC
                                                         │
                                                  Postgres + RLS
```

- **Security lives in Postgres.** Every table has RLS. The client never decides who
  can see a post; the `can_view_post()` function does, and every child table
  (images, likes, comments, tags, collection items, storage objects) delegates to
  it by checking that the parent post is selectable.
- **Writes that touch several tables go through one RPC** (`save_post`) so a post,
  its images and its tags are saved in one transaction.
- **Counters** (`like_count`, `comment_count`) are maintained by triggers so feed
  queries never aggregate.
- **Computed fields** (`viewer_has_liked`, `viewer_has_saved`) are Postgres
  functions PostgREST exposes as columns, so a feed page is one request.

## Query keys and caching

All post-shaped data lives under `['posts', …]`. Likes and saves update every cached
copy of a post optimistically through `updatePostInCaches()` and roll back on error.
Profiles live under `['profile', id]`, taxonomy under `['taxonomy']` (cached for
24h — it changes rarely).

Images in the private bucket are served by signed URLs. A whole page of image paths
is signed in one batch call, and `expo-image` gets `cacheKey = storage path`, so the
disk cache survives URL re-signing.

## Pagination

- Feed, diary, discover grids, comments: keyset (cursor) pagination on
  `(timestamp, id)` — stable under inserts and cheap with composite indexes.
- Rankings: the `get_rankings` RPC computes `row_number()` over the filtered set and
  pages with limit/offset. A single user's ranking is bounded (hundreds of rows),
  and the rank number must be computed over the whole filtered set anyway.

## Auth & session

- Supabase Auth, email + password, PKCE flow.
- Session is encrypted with AES-256 (CTR mode, `aes-js`); the key lives in the iOS
  Keychain via `expo-secure-store`, the ciphertext in AsyncStorage. This gets around
  SecureStore's ~2 KB value limit without storing tokens in plain text.
- Token auto-refresh pauses when the app is backgrounded.
- Route guards use `Stack.Protected`: no session → auth stack; session without a
  profile → onboarding; otherwise the app.
- Deep links `cheffy://auth/callback` (email confirmation) and
  `cheffy://reset-password` (recovery) exchange the PKCE code for a session.

## Images

1. Pick up to 6 images (ordered selection).
2. Resize on device: full 1440 px wide JPEG q0.8, thumbnail 480 px JPEG q0.7.
3. Upload to private bucket `post-images` at `{userId}/{postId}/{imageId}.jpg`
   (+ `_thumb.jpg`). Each upload is retried up to 2 times; progress is reported per
   file.
4. `save_post` RPC records paths and dimensions. Files removed during an edit are
   deleted after the RPC succeeds.

Avatars go to the public `avatars` bucket at `{userId}/{uuid}.jpg`.

## Navigation

```
Root Stack
├── (auth) Stack  — welcome, sign-in, sign-up, forgot-password
├── onboarding    — profile creation
└── (app) Stack
    ├── (tabs)    — Home | Discover | [Create] | Rankings | Profile
    ├── compose   — modal (create/edit)
    ├── post/[id], user/[id], user/[id]/connections, collection/[id],
    │   browse, search, settings, edit-profile, drafts, saved, blocked, terms
```

The Create button is a custom element in a custom tab bar that pushes the `compose`
modal rather than a real tab.

## Error, loading and offline handling

- Every list screen renders one of: skeleton, error state with retry, empty state,
  content.
- React Query retries reads twice with backoff and refetches on reconnect/focus.
- Mutations surface errors as toasts and roll back optimistic changes.
- Deleted or no-longer-visible posts return zero rows (RLS) → "This post isn't
  available" state.

## Future-proofing

| Feature | How the current design supports it |
| --- | --- |
| Comparative ranking | Add `ranking_comparisons(user_id, winner_post_id, loser_post_id)`; derive an Elo/Bradley-Terry score and order by it inside `get_rankings` instead of raw rating. Rank is never stored, so nothing to migrate. |
| Collaborative posts | Add `post_collaborators(post_id, user_id, rating, review, status)`; RLS already keys on `author_id`, extend `can_view_post` and the feed join to include collaborators. |
| Cooking progress | Add `dishes(id, owner_id, name)` and nullable `posts.dish_id`. Each post is already a single attempt with its own date and rating. |
| Recommendations | Taxonomy + tags are normalized and indexed, so interest vectors are a query away. |
| Statistics | `posts` has `made_on`, category ids, cuisine — stats are aggregations. |
| Push notifications | Add `push_tokens` and a database webhook → Edge Function on likes/comments/follows inserts. |
