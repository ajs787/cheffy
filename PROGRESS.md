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

## Code & design review (2026-10-19)

Fixed:
- **Bugs:** your own profile opened from a post had no Back button; upload
  retries failed with "already exists" after a lost response (now
  idempotent); follow buttons in search/suggestions/follower lists didn't
  update until refetch (now optimistic with rollback); drafts could be
  double-tap "liked" on the post screen.
- **Performance:** collections no longer fetched by every post menu while
  closed; signed-URL cache bounded (600 entries, expiring first).
- **Native iOS:** re-tapping the active tab scrolls to top (Home, Discover,
  Rankings, Profile); pull-to-refresh on post detail; drafts reachable from
  your profile ("N drafts to finish").
- **Consistency:** real checkmark for the current sort; Create category cards
  use the shared white card surface; one two-column grid (`PostGrid`) instead
  of five copies.
- **Structure:** post screen 375 → 126 lines (`PostDetailHeader`,
  `CommentComposer`); `ProfileView` 315 → 128 (`ProfileTabs`, `ProfileMenu`);
  `ComposeFooter` extracted; search sanitizing moved to `utils/search`; dead
  exports removed.
- **Tests added:** tag committing, idempotent upload, signed-URL caching,
  follow-state caches, progress label, encrypted session round-trip.

Sessions: the sign-out seen after a simulator reboot was a manual sign-out;
encrypted session storage also passes a round-trip test.

## R1 — UI/UX refinement & social feed redesign (2026-10-20)

Implemented per IMPLEMENTATION_PLAN.md §R1. Typecheck, lint and all 175
tests (26 suites, incl. PGlite RLS tests) pass.

- **Headers:** shared `AppHeader` variants; logo on Home only. New Activity
  inbox (bell on Home) built from real likes, comments and follows; unread dot
  stored on device.
- **Home:** Following / For You switch (`feed_posts` / `discover_posts`), new
  entry card, "Cooking lately" and "Top rated this week" modules that only
  appear when backed by real posts; mode-specific empty states.
- **Discover:** large title, category tiles using each category's newest real
  photo (icon fallback), sections hidden when empty.
- **Rankings:** "My Rankings" with sort button, summary (creations, average,
  most-made category), 64 pt thumbnails and podium ranks.
- **Create:** full-screen presentation, photo → name → category → rating →
  optional review, then collapsible Story / Tags / More details; compact
  rating readout and photo tile; Post stays pinned in the footer.
- **Profile:** "@username" + settings header; card no longer repeats the
  username on your own profile; bio moves up under the card; tighter spacing.
- **Story:** long-form story on entries — needs migration
  `20261020000001_post_story.sql` pushed to the live project before the app
  can load posts there.

Needs manual checking on a device: the full-screen Create flow (keyboard,
swipe-to-dismiss blocked when dirty), the collapsible sections, Following/For
You with two real accounts, the activity inbox and unread dot, Discover
category photos, and the Rankings sort sheet.

## V2 — Milestone 1: UI/UX fixes (2026-10-20)

- **Multiple classifications.** New `post_categories` table (migration
  `20261021000001_multi_classification.sql`, applied to the live project):
  several subcategories, cuisines and dish types per post, in picked order.
  Existing classifications were copied over. The single columns on `posts`
  stay, synced to each kind's first pick, so older readers keep working.
  `save_post` takes `p_categories`; search, Discover, Rankings filters and the
  ranking label ("Matcha · Lattes") match any classification. RLS mirrors
  `post_tags` (readable with the post, written by its author). Chips show a
  check when selected; editing restores every pick.
- **Animated welcome icons.** Cook wiggles, Bake hops with a tilt, Pour tips
  and springs back; light haptic; every tap restarts; Reduce Motion dims instead.
- **Story box.** Grows to ~⅓ of the screen, then scrolls inside itself;
  the form scrolls the box above the keyboard on focus; collapsing and
  reopening the section no longer loses what you typed.
- **Headers.** Discover and My Rankings use the same 52 pt bar as Home with a
  26 pt title; the Rankings sort control moved to its own row under the filters.

Verified: typecheck, lint, 188 tests (incl. 7 new RLS/classification DB
tests and unit tests for chip toggling, grouping and the category line).
In the simulator against live data: all three welcome animations (recorded
frame by frame), picking Matcha + Lattes together, the Story box growing to
its cap and scrolling with the caret visible, Story text surviving
collapse/reopen, the compact Discover and My Rankings headers, and ranking
rows keeping the date whole when classifications are long.

Needs checking on a device: haptics, Reduce Motion, the Story box with the
on-screen keyboard up (the simulator used a hardware keyboard), and Dynamic Type at the largest sizes on the headers.

## V2 — Milestone 2: rating rings & photo viewer (2026-10-20)

- **RatingRing** (`components/ui/RatingRing.tsx`): SVG progress ring filled to
  rating / 10 from 12 o'clock, colour blended through muted red → coral →
  orange → golden → yellow-green → green → deep green (`theme.ratingScale`),
  espresso number in the centre so it never relies on colour. Sizes sm/md/lg;
  animates only when the value changes, snaps with Reduce Motion; unrated
  shows an empty track and "–". `RatingDisplay` badges (feed, rankings, post
  detail) now render it.
- **Full-screen photo viewer** (`features/media`): one host at the root,
  opened with `openImageViewer(images, index)`. Pinch zooms around the
  fingers (to 4×), double-tap toggles 2.5× at the tapped point, pan with
  momentum while zoomed, swipe between photos, swipe down or tap to close
  (backdrop fades while dragging). Thumbnail shows instantly from the shared
  disk cache while the full image loads (signed on demand for feed posts);
  failed loads show a message. Feed photos open at the tapped photo; post
  detail opens at the current page.
- **Profile photos** open enlarged in the same viewer from the profile card
  (only when there is a photo).

Verified in the simulator against live data: ring fill and colour at 3.7,
8.2, 8.5, 8.9 and 9.0 in the feed, rankings and post detail; viewer open,
pinch to ~3.9×, pan while zoomed, double-tap back to 1×, swipe-down dismiss,
paging between two photos with the counter, thumbnail-first loading, and the
enlarged profile photo. Unit tests cover ring fill and colour blending.

Needs checking on a device: gesture feel with real fingers (especially
pinch + pan together), haptics, and VoiceOver on the viewer.

## V2 — Milestone 3: social features (2026-10-20)

Migrations `20261021000002_private_accounts.sql` and
`20261021000003_comment_threads.sql`, both applied to the live project.

- **Private accounts.** `profiles.is_private` + `follow_requests`.
  `can_view_post()` now hides a private account's posts (even public ones)
  from anyone but approved followers, so Discover, search, rankings, direct
  links, post images and collections all follow it. `follow_user()` follows
  or requests atomically; direct follows of private accounts are rejected;
  `accept_follow_request()` approves; going public auto-approves pending
  requests; blocking clears requests both ways; counts stay visible (what a
  follower would see). App: Settings toggle with explanation, Follow /
  Requested / Following button everywhere, locked private profiles, Follow
  requests screen (Confirm/Delete) and an Activity row when requests wait,
  Remove on your own followers list.
- **Comment likes.** `comment_likes` + trigger-kept `like_count`, visible and
  likeable exactly when the comment is; optimistic heart + count.
- **Replies.** `parent_id` / `reply_to_user_id`, one visible level (replying
  to a reply joins the thread), trigger-kept `reply_count`; "View N replies",
  paginated, "Replying to @name" composer, delete your own replies. Comment
  insert grants narrowed so counters can't be forged.
- **Invite friends.** Share-sheet invite (Messages, Instagram DMs, WhatsApp,
  Mail, Copy) from Settings and Home's "Find your friends" banner; no contact
  upload, no Instagram scraping.

Verified: typecheck, lint, 219 tests (16 new privacy and 8 new comment DB
tests: hiding from Discover/search/rankings/storage/collections, request,
cancel, decline, accept, remove follower, public↔private switching, blocks,
reply nesting/counts, like uniqueness and forgery). In the simulator against
live data: Settings privacy section, liking/unliking a comment (persisted
across refresh), reply mode, Invite screen and share sheet.

Not verified (needs two accounts/devices): requesting, approving and
declining between real accounts, the locked profile as seen by a
non-follower, posting a reply and seeing the thread on the other phone.

Known limits:
- Photo links already handed out stay valid until they expire (2 h) and
  images already downloaded can't be recalled; new requests are denied
  immediately after access is revoked.
- Invite links use `cheffy://`, which opens the app only once installed.
  Tappable links from Instagram need a web domain with universal links; set
  `APP_DOWNLOAD_URL` (public TestFlight link) to include a download link.
- Contact discovery (matching contacts to Cheffy accounts) isn't built; it
  needs a privacy decision. Contact *inviting* was added afterwards — see
  "V2 — Invite from contacts" below.

## V2 — Invite from contacts (2026-10-20)

Optional add-on to the share-sheet invite. Invite friends now has a
**Find from contacts** button (`src/app/(app)/invite-contacts.tsx`):

1. **Explain first.** A short screen says contacts stay on the phone, iPhone
   can share only selected contacts, and nothing sends until you do. Contacts
   permission is requested only when the person taps Continue. If access was
   already granted, the explanation is skipped.
2. **Permission.** iOS 18 offers "Select contacts" or "Share all". With
   limited access the list shows a "You're sharing selected contacts" banner
   and a **Choose more** button (`Contact.presentAccessPicker()`).
   Denied → "Contacts access is off" with Open Settings and the share-sheet
   fallback; returning from Settings re-checks access.
3. **List.** Name plus whether they have a phone and/or email, searchable.
   Contacts with neither are hidden.
4. **Invite.** Tapping Invite opens a prefilled text (`expo-sms`) to the
   contact's first number using `inviteMessage`. With no phone number or no
   SMS (iPad, simulator) it falls back to the share sheet.

**Data minimization.** We read only full name, phones and emails, then keep
`{ id, name, firstPhone, hasEmail }` in component state for as long as the
screen is open. Nothing is cached, persisted, logged or sent to Supabase.
Email addresses are never kept, only whether one exists.

**New native modules: a new dev build is required.** `expo-contacts` and
`expo-sms` are new, and the TestFlight development build doesn't include
them. Until it's rebuilt, opening "Find from contacts" on testers' phones will
fail. You run the rebuild because it needs your Apple sign-in:

```bash
npx eas-cli@latest build -p ios --profile development-device --auto-submit
```

`app.json` adds the `expo-contacts` config plugin, which sets
`NSContactsUsageDescription`: "Cheffy shows your contacts so you can text
friends an invite. Your contacts stay on your phone and are never uploaded."
`expo-sms` needs no config. Both modules ship in Expo Go, so the simulator
and Expo Go keep working without a build.

**Library bug worked around.** In expo-contacts 58.0.8,
`ContactsSortOrder.UserDefault` sends `'userDefault'`, but iOS native expects
`'useDefault'` and throws. We pass no `sortOrder` and sort by name in JS
(`src/features/invite/deviceContacts.ts`).

Verified: typecheck, lint, all tests (6 new tests for contact mapping, access
states and search in `src/features/invite/contacts.test.ts`). In the iPhone 16
simulator (iOS 18.5, Expo Go): explanation → permission prompt → "Select
Contacts" (limited) → list → Invite → share sheet with the prefilled invite →
"Invited". Choose more → added a contact → list refreshed. Don't Allow →
"Contacts access is off" screen.

Not verified: the SMS composer (the simulator has no SMS, so the share-sheet
fallback ran), Cheffy's own permission wording (Expo Go shows its own text;
check it in the new dev build), the re-check after returning from Settings,
full "Share all" access with a large address book, and Android.

### Decision needed: matching contacts to Cheffy accounts

Not built on purpose. Cheffy stores no phone numbers, and emails live only in
`auth.users`, which clients can't read. Any "friends already on Cheffy" from
contacts needs one of these:

| Option | How it works | Privacy | Cost |
| --- | --- | --- | --- |
| **A. No matching** (current) | Invite only; find people by username search | Best: nothing leaves the phone | None |
| **B. Opt-in hashed phone matching** | Users choose to add a verified phone number (SMS OTP via Supabase Auth). A `security definer` RPC takes a batch of normalized (E.164), salted SHA-256 hashes of the caller's contacts and returns only accounts that opted in to "Let people who have my number find me". Hashes aren't stored and calls are rate-limited | Good if opt-in on both sides. Phone hashes are brute-forceable (the number space is small), so treat them as personal data, not anonymous | Phone verification (SMS provider cost), a new `profile_phone_hashes` table, the RPC, rate limits, and a privacy-policy update |
| **C. Email matching** | Same RPC, but over hashed emails, matched against `auth.users` through a `security definer` function | Same caveats, and it exposes that an email has an account (enumeration) unless it's opt-in and rate-limited | No SMS cost; most contacts lack emails, so fewer matches |
| **D. Invite-code attribution** | Each invite link carries a code. When a friend signs up through it, both are suggested to follow each other | No contact data at all | Needs a web domain or universal links so the code survives install |

Recommendation: stay on A now. If discovery is wanted, prefer D (no contact
data). Choose B only with explicit opt-in on both sides, and update the
privacy policy and App Store privacy labels ("Contacts — used for app
functionality, not linked to identity") before it ships.

## V2 — Milestone 4: profile redesign & notifications (2026-10-21)

Migrations `20261021000004_notifications.sql` and `20261021000005_push.sql`,
both applied to the live project.

- **Profile.** The big membership card is gone. Instagram-style top row
  (photo with an oxblood ring — tap to enlarge — and tappable counts), name,
  "Membre depuis", bio, Edit/Share or Follow/Share, a compact Cooking ·
  Baking · Drinks line, a "Top rated" preview (top three with rank badges and
  rings, links to Rankings), then Diary / Rankings / Collections. Private
  profiles show a lock next to the name.
- **Notifications.** A `notifications` table written only by triggers for
  follow, follow request, request accepted, post like, comment, reply and
  comment like. Self-actions are skipped, repeats don't stack, and undoing
  (unlike, unfollow, cancel, delete) removes them. Server-side read state:
  the bell shows an oxblood count badge ("9+" cap); unread rows are tinted
  with a dot; follow requests can be confirmed inline; every row opens the
  post or profile. Existing activity was copied in as already read.
- **In-app banners.** Supabase Realtime on `notifications` (RLS applies)
  refreshes the badge and inbox and shows a tappable banner with sender,
  action and thumbnail; suppressed while creating/editing or in Activity;
  each event shows once; auto-dismisses.
- **Push.** One-time explanation sheet after the first published entry or
  first follow ("Turn on notifications" / "Not now"); iOS is only asked after
  tapping Turn on; never auto-offered again (Settings can reopen it; denied
  links to iOS Settings). Tokens registered via `register_push_token`,
  removed on sign-out. Settings → Notifications has status plus Follows &
  requests / Likes / Comments & replies switches. Delivery runs in the
  database: a trigger posts to Expo's push service with `pg_net`, honouring
  preferences, with an unread badge and a link back into the app. No push
  credentials in the client.

Verified: typecheck, lint, 239 tests (8 notification and 7 push DB tests:
every type, undo removal, request→accepted, read state, blocks, no forging,
token registration/moving/validation, message text, preferences and
upserts; unit tests for mapping, sentences, routes, badge, push paths). In
the simulator: new profile layout with live data, Activity from the new
table, bell with no badge after the read backfill.

**Push needs a new build** — `expo-notifications` is a native module. Until
then the app detects it's missing and Settings shows "Needs app update".
Run (it asks to set up an Apple push key; answer yes):

    export PATH=~/.local/node24/bin:$PATH && npx eas-cli@latest build -p ios --profile development-device --auto-submit

Needs checking on devices (two accounts): a like/comment/follow producing the
banner and badge live, confirming a request from Activity, the push
explanation sheet, the iOS prompt, push delivery on a locked phone, tapping a
push into the right post, and preferences switching kinds off.

## V3 — Milestone 1: classifications & profile fixes (2026-10-21)

Migration `20261021000006_classifications_v3.sql` (applied live).

- **Searchable classification picker.** Cuisines (and dish types) show the
  six most-used choices as chips (from real usage counts) plus "All
  cuisines…", which opens a searchable page sheet: Common, then A–Z, multi-
  select, and "Add “…”" for anything missing. ~70 more cuisines (Turkish,
  Middle Eastern, African, Asian, European, Latin American, Caribbean…).
- **Baking:** Pizza, Bread, Cookies, Brownies, Cakes, Cheesecake, Muffins,
  Pastries, Pies, Tarts, Rolls, Bagels, Biscuits (Donuts kept for existing
  posts), Other…. Classifications stay non-exclusive (Pizza + Italian).
- **Custom labels.** Saved through `save_post(p_custom)`; the database
  normalizes (slugify) and reuses an existing built-in or custom label, so
  "Turkish"/" turkish " never duplicate. Custom labels are searchable and
  display everywhere; they don't clutter default lists.
- **Profile photo.** Slightly larger (86 pt). Uploads no longer force a
  square crop: we store the circle crop and the original framing (long side
  1440). Tapping opens the original, aspect preserved, pinch-to-zoom.
  Older photos only exist as the 512 px square (that's the best fallback;
  the original was never uploaded).
- **Member since 10/20/2026** from the account's real `created_at`, as a
  subtle caption.
- Fixed while verifying: the picker's search field dropped keystrokes
  (now uncontrolled with a deferred filter); "Add" sits below real matches.

Verified: typecheck, lint, 253 tests (9 new DB tests for taxonomy and custom
labels incl. normalization, reuse, subtype parents, validation, no direct
inserts; unit tests for picker helpers, crop math and the date). In the
simulator: chips and sheet, search "turk" → Turkish, selection, baking list,
profile photo size and date. Not verified: uploading a new non-square photo
(needs your photo library) — check on a phone.

## V3 — Real-time notifications fix (2026-10-21)

**Root cause.** The Realtime publication, RLS and auth were fine (the live
DB has `notifications` in `supabase_realtime`; the channel reached
SUBSCRIBED). The bug was the subscription lifecycle: realtime-js
`channel(topic)` returns the *existing* channel for a topic and
`removeChannel` is async, so re-subscribing with the same topic (remount,
sign-out/in, fast refresh) got the old already-joined channel and `.on()`
threw "cannot add postgres_changes callbacks … after subscribe()". Inside the
effect that error silently stopped live updates until the app restarted.
Separately, nothing refetched events missed while the socket was suspended
(background) or offline.

**Fix** (`features/activity/notificationsChannel.ts`):
- unique topic per subscription; clean teardown;
- passes the current session token to Realtime before joining;
- on every join (initial and each reconnect) resyncs the unread count and
  inbox, so missed events come back after offline/background;
- refreshes when the app returns to the foreground;
- retries with exponential backoff after CHANNEL_ERROR / TIMED_OUT;
- banners only for events that arrive live, deduped by id.

Verified: unit tests for unique topics, resync on join/rejoin, retry after
error, clean stop; in the simulator, the channel joins on launch and
re-joins after a remount (the failing path) without error.
Not verified: a live event from a second account (needs the friend's phone).

**In-app vs push.** Realtime only delivers while Cheffy is open and
foregrounded; iOS suspends the socket in the background. Background/closed
delivery is push: a database trigger sends each notification through Expo's
push service (`pg_net`) to registered device tokens. That requires the
TestFlight build containing `expo-notifications` and an APNs key configured
by EAS (answer yes when the build offers to set up push), plus the user
allowing notifications.

## V3 — Milestone 2: collaborative posts (2026-10-21)

Migration `20261021000007_collaborations.sql` (applied live).

**Model (normalized, no duplicated posts).** `posts.author_id` is the
creator. `post_collaborators(post_id, user_id, status, invited_by, …)` with
pending → accepted / declined, accepted → removed. `post_evaluations(post_id,
user_id, rating, review)` holds each accepted co-creator's own score; the
creator's stays on `posts.rating`. Likes, comments and photos belong to the
one shared post.

**Permissions** (all writes through checked functions; clients can't insert
rows, so nobody can add themselves):
- creator: `invite_collaborators` (published posts only, ≤5 active, no
  blocked users, re-invite after decline/leave), `remove_collaborator`,
  edits shared details (posts RLS unchanged — collaborators can't edit);
- invitee: `respond_to_collaboration` (own pending invite only);
- co-creator: `set_my_evaluation` (own row only), leave via
  `remove_collaborator(self)` — the creation stays, their rating goes.
- Visibility: creator's account/post rules as before, plus invitees and
  co-creators always see the shared post (and so its photos/comments).
  Pending/declined rows are visible only to creator and invitee.

**Everywhere it shows up.** Diary (`diary_posts`), rankings
(`creations_of` — each person's own rating; unrated collaborations aren't
ranked until rated), ranking filters, profile counts, the feed (followers of
any co-creator), rating summary. Notifications `collab_invite` (to invitee,
cleared once answered) and `collab_accepted` (to creator), with push text.

**App.** Feed cards read "Audrey and Sophie"; post detail has the shared-
creation panel (invitation Accept/Decline, co-creators with their own rings
and reviews, Add/Edit your rating, Leave, creator's Invite/Remove, waiting
list); Create has "Made with" (invites sent on publish); Activity has inline
Accept/Decline.

Verified: typecheck, lint, 274 tests (14 collaboration DB tests: creator-only
invites, published-only, cap, blocks, no forged rows, invitee visibility,
accept/decline/re-invite, independent ratings, per-user rankings, diary/
stats/feed inclusion without duplication, leave/remove, creator-only edits,
private pending rows; unit tests for mapping and names). Simulator: feed and
diary load through the new queries; creator panel and people picker.

Needs two accounts: send an invitation, accept/decline on the other phone,
each adding their own rating, the shared post on both profiles and in both
rankings, leaving.

## V3 — Milestone 4: ranking experience (2026-10-21)

Migration `20261021000008_ranking_experience.sql` (applied live).

- **Placement celebrations.** After publishing a new entry,
  `ranking_placement` returns its real rank within its primary category in
  the person's rankings and the creation directly below it if that one was
  there first. The app celebrates a new #1 ("Your new #1 drink!" +
  "Strawberry Matcha just passed Pistachio Latte.") or a top-five finish,
  only with at least 3 entries in that category — never for first entries.
  A brief spring-in sheet; Reduce Motion skips the motion.
- **Head-to-head.** Optional "Which did you enjoy more?" against the
  closest-rated earlier creation in the same category (within 1 point,
  same rating first), never the same pair twice (`ranking_comparisons`,
  unique per pair; preferred / other / "About the same"; Skip). Ratings are
  never changed. Comparisons only order creations with the *same* rating;
  if someone prefers the lower-rated one, the app says so and offers
  "Adjust rating" instead of reordering against their numbers.
- **Friends' rankings.** Rankings → Mine | Friends: each followed person's
  top 3 per category (All/Cooking/Baking/Drinks) by their own ratings,
  "Rankings ›" opens their profile on the Rankings tab. "You both love …"
  on a friend's profile lists classifications you both rated 8+. Everything
  runs as the viewer, so RLS hides private accounts and posts.
- The notification offer after a first post waits if a ranking moment shows.

Verified: typecheck, lint, 286 tests (8 DB tests: placement rank/total/
passed, category scoping, no false "passed", comparisons reorder only equal
ratings and never change ratings, candidate choice and no repeats, own-
creations-only and privacy, friends' tops with visibility, shared
favorites; unit tests for the celebration rules and conflict detection).
Simulator: Mine/Friends switch, Friends' Rankings with live data, opening a
friend's Rankings tab. Not verified live: the post-publish sheet (needs a
real new entry — try it on your phone).

## V3 — Milestone 5: minimal unlocks (2026-10-21)

Migration `20261021000009_unlocks.sql` (applied live).

Four unlocks only — no XP, levels, streaks or badge walls; nothing basic is
gated:
- **Saffron theme** — 3 published creations (warm gold accent, AA on ivory).
- **Host’s frame** — 2 verified referrals (double ring around the photo).
- **Made Together** — first accepted collaboration, for both people (a quiet
  mark beside the name).
- **Cooking recap** — 10 published creations.

**Server-side, idempotent.** `profile_unlocks` (one row per unlock, never
revoked) is written only by `refresh_unlocks`, run by triggers on publishing
and accepting collaborations and on verified referrals; `my_unlocks` also
backfills what people earned before this shipped. Clients can't insert
unlocks, call `refresh_unlocks`, or set theme/frame directly —
`set_profile_style` checks the unlock.

**Referrals without fraud.** Personal 8-character codes (`my_invite_code`).
Credit only through `redeem_invite_code` by the *new* account: email
confirmed, account under 14 days old, profile finished, one redemption ever,
not your own code, no referring back, nothing across a block. Opening
`cheffy://invite/CODE` just remembers the code; it's redeemed after the new
account has a profile. `referrals` and `invite_codes` are unreadable to
clients; people only see their own count.

**App.** Settings → Personalize profile (themes, frames, distinction, recap,
with honest progress like "2 of 3 creations"); Invite friends shows your code
and includes it in the share message, plus "Joined because of a friend?" to
enter one; one quiet toast when something new unlocks. Recap screen (total,
average, since, Cooking/Baking/Drinks split, most made only when one leads,
highest rated, favorite cuisines only with 3+ cuisine-tagged entries).

Verified: typecheck, lint, 299 tests (8 unlock DB tests: thresholds, drafts
excluded, idempotence, no revocation, no forging/self-granting/locked style,
made-together for both, two verified referrals → frame, self/repeat/reverse/
old/unverified/bad-code rejection, private referral data, recap gating and
contents; unit tests for progress, one-time announcements and recap rules).
In the simulator with live data: Personalize shows Saffron unlocked (4
creations), frame 0 of 2, recap 4 of 10; applying Saffron saved and was
reverted. Needs real accounts: redeeming a code from a new signup, the frame
unlocking, Made Together after a real collaboration, the recap at 10.

## Not verified yet

1. Live, not yet exercised: follow/unfollow, search, collections, saved,
   edit/delete post, block/report, account deletion, password reset and
   email-confirmation deep links.
2. Two-device acceptance test (`docs/ACCEPTANCE_TEST.md`) — needs a second account.
3. Keyboard avoidance inside the full-screen Create on a real device.
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
  Expo Go before any Apple account exists. (`expo-contacts` and `expo-sms`
  ship in Expo Go, but the TestFlight dev build must be rebuilt to include them.)
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

## V4 · Priority 0 — Email verification (in progress)

**Diagnosis (2026-10-21, live project `yqzycfujpzibzkkdybyu`).** Confirmations are on
(`mailer_autoconfirm: false`) and emails are being delivered: 5 of 6 accounts confirmed
within seconds of the email. The break is the redirect: the live **Site URL is
`http://localhost:3000` and `cheffy://` is not in the redirect allow-list**, so Supabase
ignores the app's `cheffy://auth/callback` and sends the phone's browser to
`localhost:3000`, which fails. The email gets confirmed but Cheffy never opens, and the
PKCE codes are never exchanged (every row in `auth.flow_state` still holds an unused
code). Verified by requesting `/auth/v1/verify` with an invalid token and three
`redirect_to` values: all were sent to `http://localhost:3000`.

**App changes (done).**
- Resend confirmation with a 60s cooldown on the "Check your inbox" screen, and on sign-in
  when Supabase answers "Email not confirmed".
- Callback screen states: verified, confirmed (but link opened elsewhere → sign in),
  expired, and invalid. A signed-in user who opens an old link just continues home.
- Unit tests for the cooldown and callback parsing.

**Needs you, in the Supabase Dashboard → Authentication → URL Configuration:**
1. Site URL: `cheffy://auth/callback`
2. Redirect URLs, add: `cheffy://**` and, for Expo Go development, `exp://**`
3. Authentication → Emails → SMTP: the built-in sender is limited (a few emails per hour,
   and it may only deliver to project team members). Set up custom SMTP (e.g. Resend,
   Postmark) with your domain's SPF/DKIM records before inviting testers. The SMTP
   password lives only in the Dashboard, never in the app.

**Unverified:** the full flow on a physical iPhone with a real inbox (sign up → email →
tap link → Cheffy opens → "You're verified" → onboarding). Not yet claimed fixed.

**Re-check after the Dashboard update (2026-10-21):** the live project still redirects
`cheffy://auth/callback` to `http://localhost:3000`, polled for more than 3 minutes. The URL
settings have not taken effect yet.

## V4 · Priority 1 — Most Hated (built; migration not yet pushed)

- `20261022000001_most_hated.sql`: `most_hated_posts()` returns the week's lowest
  self-rated public creations. Lowest first; ties go newest first, then by id.
  - Eligible: public posts from public accounts with a photo, rated ≤ 5.0, published in the
    last 7 days.
  - Excluded: opted-out creators, posts with open or actioned reports, creators with an
    actioned report, and anyone blocked either way.
  - Anti-abuse: one post per creator; verified accounts at least 48 hours old only.
  - Returns nothing below 3 eligible posts.
  - Tunables live in `app_config`, which clients can't read.
- `profiles.allow_most_hated` (default on) with a Settings switch. No notifications are
  sent to featured creators.
- Discover: a crème-band carousel showing rank, photo, rating ring, title and @username.
  It hides itself when the RPC returns nothing.
- Tests: `tests/db/most-hated.test.ts` covers threshold, ordering, eligibility, anti-spam,
  reports and blocks, and access.

## V4 · Priority 2 — Find Friends and referrals (built, not committed)

- **Find friends** (`/invite`, Settings → Find friends) puts everything on one screen:
  - username search and suggestions;
  - a referral card ("Invite 2 friends who join Cheffy to unlock an exclusive profile frame"),
    with live progress from `my_unlocks`;
  - Share your invite (system share sheet), Copy invite link, and Invite from contacts;
  - the invite code, plus code entry for accounts under 14 days old.
- **Contacts:** unchanged privacy model. The feature is explained first, and permission is
  requested only on tap. Limited access works, including "choose more". People are picked one
  at a time and the person sends the text themselves. Nothing is uploaded and there's no
  contact matching, and the copy never claims otherwise.
- **Clipboard:** `expo-clipboard`, loaded only when the build includes it. Older builds fall
  back to the share sheet.
- **Attribution:** a pending code from `cheffy://invite/CODE` survives onboarding and is now
  kept when redemption fails offline (it used to be dropped). The server still requires a
  verified, new (14 days or less), complete account, with no self, repeat, reverse or blocked
  referrals, and credits only after redemption. Existing tests: `tests/db/unlocks.test.ts`.
- **Limits that need you:** Cheffy has no web domain, so invite links use `cheffy://` and only
  open once the app is installed. Attribution can't survive an App Store/TestFlight install;
  the fallback is typing the code, which the invite text includes. Real `https://…/invite/CODE`
  links need a domain with an `apple-app-site-association` file plus `associatedDomains` in
  app.json. Set `APP_DOWNLOAD_URL` to the TestFlight public link so invites include it.
- **App Store:** the contacts purpose string is set. In App Privacy, contacts are not
  "collected", because they never leave the device.
- **Needs a new build:** expo-clipboard (Expo Go already has it).

## V4 · Priorities 4 and 5 — Profile order and rating ring (built, not committed)

- **Profile header order:** photo and counts, display name, bio (full, wrapping), then
  "Member since October 20, 2026" (the account's real `created_at`, long English format, in
  the tertiary color), then the actions and tabs.
- **RatingRing:** stroke goes from 3 to 3.6 (sm/md) and from 3.5 to 4.2 (lg), about 20%
  thicker. The radius subtracts the stroke, so nothing clips. Progress (rating / 10), color
  interpolation, rounded caps and the centered number are unchanged. Reviewed at 0.0, 3.5,
  6.5, 9.2 and 10.0 at all three sizes in the simulator.

## cheffy.me website and links (built, not deployed or committed)

- `web/` is a static site for Cloudflare Pages, laid out like beliapp.com in Cheffy's colors
  and fonts:
  - home: hero with phone, "Welcome to Cheffy" with Log / Share / Cook together, using real
    app screenshots;
  - invite page `/invite/CODE`;
  - open-in-app page `/user/*` and `/post/*`;
  - email-link fallback `/auth/callback`;
  - privacy and terms pages;
  - `.well-known/apple-app-site-association`;
  - `_redirects` and `_headers`.
  Preview locally with `python3 scripts/serve-web.py web 8788`.
- The download link is set in one place: `DOWNLOAD_URL` in `web/site.js`. Until it's set,
  buttons say "Coming soon".
- App:
  - `associatedDomains: applinks:cheffy.me`;
  - shared links and invites use `https://cheffy.me/...`;
  - email links use `https://cheffy.me/auth/callback`, except in Expo Go, which keeps its
    exp:// link.
- **To finish:**
  1. Replace `TEAMID` in the AASA file with the Apple Team ID.
  2. Deploy `web/` to Cloudflare Pages and attach cheffy.me.
  3. Supabase: set Site URL to `https://cheffy.me` and allow `https://cheffy.me/**` and
     `exp://**`.
  4. Make a new EAS build: Universal Links only work in builds that include the domain.
  5. Optional: Cloudflare Email Routing for hello@cheffy.me.
- Deleted @audfrog (2026-10-21), at the owner's request: login, profile, 1 post, 1 comment,
  1 like and 5 storage files.

## Verified on a physical iPhone (2026-10-22, build 5)

- **Email verification works end to end.** Signing up sends the email; tapping the link opens
  Cheffy directly via https://cheffy.me/auth/callback and shows "You're verified". The
  root cause was the Supabase Site URL being `http://localhost:3000`. It's now
  `https://cheffy.me`, with `https://cheffy.me/**` and `exp://**` allowed.
- **Universal Links work:** `https://cheffy.me/invite/CODE` opens the app.
- cheffy.me is deployed as a Cloudflare Worker serving `web/` (wrangler.jsonc). Pushes to
  `main` redeploy it.

## V7 — Bug fixes, performance and UX (2026-10-23, not yet committed or pushed live)

**1. "Too many attempts" at sign-up.** Root cause: Supabase's built-in email sender, which
allows about 2 emails per hour for the whole project. Every hour with sign-ups shows exactly 2
confirmation emails, and the third person in an hour gets `email rate limit exceeded`. There
were no resends or password resets, so retries didn't cause it.
- App side, also fixed: the keyboard's Done key could start a second sign-up while one was in
  flight. `useAuthSubmit` now allows one request at a time on sign-in, sign-up and forgot
  password.
- Rate-limit responses are told apart (email quota, per-address cooldown, request
  throttling) and show an honest message. The button counts down using Supabase's own wait
  time. Nothing retries automatically, and typed text is kept.
- **Real fix (you):** custom SMTP in Supabase → Authentication → Emails, then raise
  Authentication → Rate Limits → "emails sent per hour". **Not verified end to end.**

**2. Lag.** Measured before changing anything:
- Main queries take 11–35 ms warm.
- Development builds served over the tunnel (everything before build 6) are much slower
  than release builds.
- **Found a real scaling bug:** profile stats and rankings ran their visibility checks on
  every post in Cheffy, because of a bad row estimate on `creations_of`.
  `20261023000001` fixes it. Measured on live data: profile_stats 65 → 10 ms,
  get_rankings 36 → 19 ms. Cost now grows with one person's diary, not the whole app.
- Likes were already optimistic with rollback.
- Image sizes measured: profile photos in lists are 79 KB. Feed covers average 640 KB, so a
  medium-size cover is a candidate follow-up.
- Added: "Signing in…", "Creating account…", "Sending…", "Posting…" and "Saving…" labels.
  The entry form ignores a second tap while saving.

**3. Password visibility:** a reusable `PasswordInput` with an eye button, on sign-in, sign-up
and both reset-password fields.

**4. Comments and replies:** text stays until the server confirms. Then the field clears, the
keyboard closes and the composer collapses. On failure the text is kept and an error shows. A
spinner replaces "Post" while sending, and double sends are blocked.

**5. Keyboard stickers: not implemented, on purpose.** React Native 0.88's TextInput has no
image or rich-content input: no paste-image event and no iOS adaptive-image-glyph or sticker
support. Doing it needs a native text view (custom Expo module) with
`supportsAdaptiveImageGlyph`/paste handling, plus:
- a comment-stickers storage bucket with RLS;
- format and size validation;
- moderation and reporting coverage;
- a new build.
Emoji are not a substitute.

**6. Photo preview while composing:** tap a photo for the full-screen viewer (pinch, swipe,
original aspect, best resolution, works for new and already-uploaded photos). Options moved to
a "•••" button and long-press. The entry form mounts its own viewer so it presents correctly
over the full-screen form. **Not yet tapped through in the simulator** (the system photo
picker couldn't be driven reliably).

**7. Made Together:** removed from the profile header, Personalize and unlock announcements
(the data is kept). Now a small tag on posts with accepted co-creators (feed card and post
page).

**8. OG Chef** (`20261023000002`): 10 permanent slots, filled in `auth.users.created_at` order
with user id as tie-break.
- Eligible = confirmed email + finished profile. Clients can't write it, and a deleted
  account's slot is never reused.
- The backfill gives slots to the 9 eligible accounts that exist now; the next eligible
  sign-up gets slot 10.
- **Ambiguity:** the first-ever account (@audfrog) was deleted on 2026-10-21 before tags
  existed, so it isn't counted. The unconfirmed jana.com sign-up is excluded.
- Shown as a small oxblood "OG Chef" tag beside the name on profiles.

**9. Rating colors:** one scale from #E5484D (0) to #20C967 (10) through the requested
anchors, blended evenly in OKLab.
- Rings, the slider track and the thumb use it.
- Numbers use the same hue deepened to ≥4.5:1 contrast on ivory (≥3:1 for the big slider
  number).
- Rings animate through 21 precomputed stops. Tested at 0.0, 2.5, 5.0, 6.5, 8.0, 9.2 and
  10.0.

**10. Review sections:** "How you made it" and "Notes for next time" removed from the form.
Old posts keep and still show their values, and editing an old post saves them back
unchanged.

**11. Settings switches:** each is wrapped in a full-height centering box (the iOS Switch
otherwise sat at the row's top). Verified in the simulator.

**12. "You both love":** now a heading plus a horizontally scrolling row of chips (one per
shared favorite, both people's dish and rating). It bleeds to the screen edges, so the last
chip scrolls fully into view.

**13. Activity:** sections are Featured, Today, Yesterday, Last 7 days and Earlier.
- Featured = collaboration invites, accepted collaborations and accepted follow requests
  from the past 7 days, max 5, never repeated below.
- Grouping uses the phone's local calendar days, newest first, and keeps read/unread
  styling. It shows the latest 100 notifications.

**Checks:** typecheck, lint, 347 tests (187 database). **Unverified on a device:**
- sign-up under the email quota, and password toggles (the simulator is signed in; I can't
  enter passwords);
- comment collapse;
- the photo preview over the composer;
- the OG tag and the new rating colors on screen (both need the migrations pushed first).

## Sign-up rate limit — follow-up (2026-10-23)

- **Evidence:** across every hour since launch, Supabase has never sent more than 2
  confirmation emails in one clock hour (today: 16:38, 16:45, then nothing until 17:39). That
  matches the built-in email sender's project-wide limit. No account has been
  re-sent a confirmation, and no password resets were requested. The reported message
  ("…Please wait a minute and try again.") only exists in builds ≤ 6.
- **Code trace:** one Supabase client, one sign-up call site, one resend call site, and no
  auth effects or automatic retries (auth-js only labels errors retryable). React Query
  mutations use `retry: 0`.
- **Changed today:**
  - The form locks only for a wait Supabase actually returns (`after N seconds`), never an
    invented one.
  - Honest messages for the email quota and for request throttling.
  - The generic mapping no longer promises "a minute".
  - Safe `[auth]` diagnostics: operation, status, code, kind, time; never email, password or
    tokens.
  - A neutral note on "Check your inbox" for already-registered emails. Supabase sends no
    link in that case and hides it deliberately.
- **Not fixed until you configure custom SMTP.** Confirm in Supabase → Logs → Auth: filter
  for status 429 and look for `over_email_send_rate_limit`.

## Budget Eats, Find Friends, Instagram (2026-10-24, built; migrations not pushed; not committed)

**Budget Eats** (`20261024000002`)
- `posts.is_budget` and `posts.budget_cost_cents` (USD cents, 1–100,000, only on tagged
  posts), plus a partial index.
- `save_post` writes them only when the client sends them, so builds ≤ 7 editing a post can't
  erase them.
- `discover_posts` gains `p_budget`, `p_max_cost_cents` and a `cheapest` sort. Price filters
  use the stored number; unpriced posts appear under "All" but not in priced filters.
- App:
  - a Budget Eats switch plus an optional "$ / serving" field on the entry form;
  - "Budget Eats · ~$3.20 / serving" on cards and post pages;
  - a Discover section, with a browse screen offering All / Under $3 / $5 / $10 and Highest
    rated / Newest / Lowest cost.

**Find Friends** (`20261024000003`, new `/find-friends`)
- `search_profiles(q, offset, limit)`:
  - partial username or display-name matching, best matches first, paged;
  - `_` and `%` treated literally;
  - hides blocked people *both* ways (profile visibility rules only hid people who blocked
    you) and suspended accounts;
  - the Search screen's People tab uses it too.
- `suggested_friends`: honest reasons ("Follows you", "Followed by @x and N others",
  "Active on Cheffy"). It leaves out people you follow, have requested, blocked, or
  dismissed (`suggestion_dismissals`, private to you).
- The screen:
  - search with a 250 ms debounce, then a vertical results list with an invite row at the
    end;
  - Recents (on device, per account, max 12, remove one or clear all);
  - Suggested cards with a dismiss X and "See all";
  - an Invite card (share sheet with the cheffy.me invite link, invite from contacts, link
    to code and rewards).
- Follow buttons now show a spinner and ignore taps until the request finishes. The invite
  screen is invitations only.
- Entry points: a Discover header button, Settings, and the empty states on Home, Discover
  and Friends' Rankings.
- **Not built:** server-side contact matching. Contacts stay on the phone. Matching would
  need consented, privacy-preserving hashing of phone numbers and emails and a
  discoverability setting; neither exists, so nobody is labelled a contact match.

**Instagram** (`20261024000001`)
- `profiles.instagram_username` with a format check, editable in Edit Profile (username,
  @username or an instagram.com profile link; blank removes it).
- Other sites, other URL schemes, post links and bad characters are rejected.
- The profile shows an outline glyph that opens `https://www.instagram.com/<name>/` (iOS
  opens the app when it's installed). It's hidden from people who can't see a private
  account's content. Unverified: no Instagram login.

**Checks:** typecheck, lint, 369 tests (198 database, including new Budget Eats, Find
Friends and OG/terms coverage). **Font note:** the brief mentions Bodoni Moda, but the app
uses DM Serif Display. It was kept, so nothing changed visually.

## Supabase reliability (2026-10-25) — see SUPABASE_RELIABILITY_AUDIT.md
- **Database:** restarted 02:11 UTC Oct 25, not caused by app load or migrations (likely
  Supabase infrastructure; unconfirmed).
- **App bug fixed:** HTTP 5xx was reported as "offline".
- **New:** error classification, request timeouts, jittered and bounded retries, and
  ambiguous-sign-up messaging.
- **Accounts:** none created since Oct 23. Check Resend delivery and Supabase Auth logs
  (dashboard).

## Smarter suggestions (2026-10-25; migration live; UI not yet seen signed-in)
- `suggested_friends(limit, offset)` ranks:
  - mutual follows ("Followed by @x and N others");
  - then people who follow you ("Follows you");
  - then shared cooking interest, meaning ≥2 public posts in the category you make most
    ("Also loves baking");
  - then recent public activity ("Active on Cheffy").
  Follower counts never matter, and private accounts' posts are never used.
- New `profiles.discoverable` (Settings → "Suggest my account to others"); search still
  finds opted-out people.
- New paged "See all" screen (`/suggested`) with "Not interested". Dismissals apply to every
  cached list, and suggestions refresh at most every 10 minutes.
- No contact matching exists, so "From your contacts" is never shown.
- DB tests: ranking order and labels, opt-out, paging, private accounts (200 DB tests).

## Fix: delete-account / sign-out freeze (2026-10-25, committed 6e21062)
- Cause: iOS can't present one modal while another is still dismissing, or tear down the
  navigator under a visible modal. Deletion swapped two separate confirmation sheets
  mid-animation, and both deletion and sign-out signed out while a sheet was still open.
  Either can leave an invisible layer that blocks all taps.
- Fix: one two-step `DeleteAccountSheet`. `deleteAccount()` no longer signs out; the
  sign-out runs from the sheet's `onClosed`, with a once-only 1.5 s fallback. Sign out
  works the same way. `ConfirmationDialog` gains `onClosed`.
- Unverified on a device (the simulator is signed out).
- Follow-up (50c465f): a 401 from `delete-account` (the server had already signed this
  phone out) now signs out and asks the person to sign in again. Errors show in the sheet.
  Verified in the simulator: the test account was deleted at 22:48 UTC.
- Sign-in error (5a7340c) now also covers having no account. Supabase deliberately
  doesn't say which, so sign-in can't reveal who has an account.

## Profile, Co-Chef, banners & follow fixes (2026-10-25, not committed)
1. **@username header on every profile.** Other people's profiles now show it too (own
   profile already did). It comes from the profile query, so a changed handle shows right
   away. Long handles truncate between the Back and menu buttons.
2. **"You both love" cards.** The cause was one-line text in 220 pt chips. Cards are now
   about 68% of the screen width (at most 260 pt). The category wraps to 2 lines and each
   dish to 3; cards in a row share the tallest height; the rating sits on its own line so
   it's never cut. Tapping a dish opens its post, where the full title is.
3. **Co-Chef review keyboard.** `BottomSheet` now rises above the keyboard, drops its
   home-indicator padding while the keyboard is up, and a backdrop tap first only hides the
   keyboard. New `dragFromHandleOnly` option. `KeyboardDoneBar` is an in-sheet "Done" row
   shown while the keyboard is up (RN 0.88 deprecates `InputAccessoryView`).
   `MyEvaluationSheet`: the form scrolls (drag down hides the keyboard), a tap on blank space
   hides it, and Save stays above it. Reviews are trimmed on save, and blank ones are ignored
   when shown. A saved review of a single blank character (likely a Return pressed to close
   the keyboard) had hidden the placeholder and left an empty gap under "You".
4. **Banners.** Swipe up (or a quick flick) to dismiss without opening; a swipe cancels the
   tap. The banner stays up while touched. 4.5 s, or 10 s with VoiceOver/TalkBack. There
   is a VoiceOver "Dismiss" action and escape gesture. Banners queue one at a time (up to
   3 waiting, 280 ms apart). Dismissing hides the banner only; Activity and unread state
   are unchanged.
5. **Follow from Activity.** Cause: the follow mutation updated profile, search,
   suggestion and follower-list caches, but not Activity, and the row hid the button once
   following. Now the same optimistic update and rollback also covers Activity rows; the
   button stays and shows Following/Requested (with a spinner and no double taps while
   saving). Activity is cancelled and refetched with the other graph queries.
- Tests: Activity follow-state sync and rollback; banner queue (388 tests total).
  Typecheck and lint clean.
- **Simulator (iPhone 16, @chefshin, read-only):** checked the @helenkwok header; the wrapping
  cards, scrolling to the last card, and a dish opening its post; the review sheet's keyboard
  (Done, backdrop tap, text kept, Save reachable, placeholder restored), closed without
  saving.
- **Not verified:** banners (need someone else's live activity) and following from Activity
  (needs a real follow). Also not tried: iPhone SE size, large text.
- Expo Go crashed once in Hermes during a hot reload while the old `InputAccessoryView`
  sheet was open. A fresh load was fine.


## Top comments on feed cards (2026-10-25, not committed)
- Feed cards (Following and For You) show up to two top-level comments, most liked first
  then earliest: **username** comment, two lines each. "View all N comments" appears when
  there are more. Tapping opens the post's comments.
- Same request as the feed: the comments come in with each page, like "Liked by". There is
  no extra request per card and no database change. Six candidates are fetched per post and
  replies dropped on the client, because an embedded filter fails on the feed's database
  functions (`column pgrst_call.parent_id does not exist`).
- Your new top-level comment fills an empty preview slot; a deleted one leaves the preview
  at once. Comments from blocked people are left out.
- Verified in the simulator (iPhone 16, @chefshin): one-comment and two-comment cards, and
  tapping to open the post. "View all N" (more than two top-level comments) not seen live.
- Reordered (Instagram style, not committed): photos and review → like/comment/save row →
  "Liked by" → up to two comments (4 lines each before "…") → "View all N comments".
  Layout only; same data, no new requests. Seen in the simulator on a multi-photo post
  with 5 comments.
- Spacing fix (not committed): actions, likes and comments are now one block, so the
  card's 12 pt section gap no longer applies between them. The action row is 36 pt
  (6 pt around the 24 pt icons; hitSlop keeps touch areas ≥ 44 pt). "Liked by" sits
  about 8 pt under the icons, comments 4 pt below. The −4 pt margin is removed.
  `LikeButton` takes an optional `style`; the post page is unchanged.


## Cheffy 1.0 launch readiness (2026-10-26, branch `launch-readiness`, not pushed)

Detailed docs: [SECURITY_AUDIT.md](SECURITY_AUDIT.md), [APP_REVIEW_CHECKLIST.md](APP_REVIEW_CHECKLIST.md),
[MODERATION_ADMIN_GUIDE.md](MODERATION_ADMIN_GUIDE.md), [docs/APP_STORE_METADATA.md](docs/APP_STORE_METADATA.md),
[docs/security/NEEDS-VALIDATION.md](docs/security/NEEDS-VALIDATION.md).

| Task | Status | Notes |
|---|---|---|
| 1. Website TestFlight CTAs | Completed (not deployed) | "Join the iPhone Beta" points to the public TestFlight link on every page. Checked at desktop and phone widths. Deploys on merge to main. |
| 2. Moderation dashboard | Partially complete | `/admin/moderation` built: per-report review, evidence snapshot, priority, notes, actions, audit trail, pending count, email alert function. Server-enforced via `assert_moderator()`. Tested with DB tests and a local UI run; **not deployed, and not run against the live project**. |
| 3. App Store metadata | Partially complete | Text, keywords and URLs ready. "(3a0e77)" is the App Store Connect record name set by EAS Submit; you rename it there. 6.9" screenshots still needed. |
| 4. App Review checklist | Completed (document) | Remaining blockers need your accounts or approval. |
| 5. Security audit | Completed (audit), fixes not deployed | 14 leads, all `needs_validation` (source-only run). All fixed in `20261026000002_security_hardening.sql` with 14 regression tests. |
| 6. Code quality and performance | Completed (review) | Listener and timer cleanup, FlashList and image caching fine. Fixed hidden bottom sheets listening to the keyboard. No device profiling. |
| 7. Release testing | Partially complete | See below. |

### Release testing (Task 7)
- **Automated:** 418 tests pass (228 database, 190 app). Typecheck and lint are clean.
- **Browser (local):**
  - Website CTAs on every page.
  - `/admin/*` security headers.
  - Dashboard sign-in screen and rendering.
  - Callback page forwards only auth fields.
- **Earlier this week:**
  - Simulator (read-only, @chefshin): feed, comments, profile, Co-Chef review sheet.
  - Sign-up, confirmation, password reset and account deletion: seen in the live auth logs
    for test accounts.
- **Not run:**
  - Moderation actions against live data, which need the migrations pushed and a test
    account.
  - Banners and following from Activity on a device.
  - Build 11.
  - Any destructive flow on real accounts (not allowed).
- **Owner approvals pending:**
  - Push both migrations.
  - Merge to main (deploys the site).
  - Redeploy `delete-account`.
  - Deploy `moderation-alert` with its secrets.
  - Build 11.
  - App Store Connect fields.
  - Nothing has been submitted to Apple.
