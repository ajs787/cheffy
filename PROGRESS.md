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
- **Migrations live (2026-10-26):** both pushed after your approval. Live data was checked first (3 reports, 126 images, 0 violations). Afterwards, live privileges were confirmed read-only: no client profile delete, no theme insert, no snapshot read; 4 new policies and 3 constraints; @chefshin is a moderator.
- **Owner approvals pending:**
  - Merge to main (deploys the site).
  - Redeploy `delete-account`.
  - Deploy `moderation-alert` with its secrets.
  - Build 11.
  - App Store Connect fields.
  - Nothing has been submitted to Apple.

## Likes list & smarter discovery (2026-10-27, branch `discovery-likes`, not committed)

**Likes**
- "Liked by …" on feed cards is now one full-width tap target (the hit area is enlarged
  without changing the tuned spacing).
- The like count next to the heart opens the same list. The heart and the count are
  separate targets, so opening the list can't toggle your like.
- The list is a native iOS sheet (`/likes/[id]`, form sheet, 60% / full height):
  - "N likes" total, then avatar, name, @username and Follow / Following / Requested;
  - each row opens the profile, and Back returns to the list;
  - paged 30 at a time, with an empty state;
  - refreshes after you like or unlike.
- Privacy comes from the existing RLS. Likes are readable only on posts you can see, and
  people on either side of a block have no readable profile, so they're left out. No
  database change was needed for this part.

**Find Friends and Search → People**
- Find Friends: Recent → Suggested for you (top 10 cards) → People you may know (further
  suggestions with real mutual follows, shown only when they exist) → Invite.
- Search results list matches only, then up to 3 "You might also know" below them (from
  the already-loaded suggestions, so no extra request).
- Search's People tab now matches this: recents and suggestions with reasons when empty,
  then paged matches.

**Discover**
- New layout: Search → **For Your Taste** → Suggested for you (people) → category tiles →
  the existing rows.
- For Your Taste:
  - topic chips (tags, cuisines, dish types and Budget Eats, each with its real count);
  - a carousel of picked creations, with "See all" opening `/taste`;
  - cards show photo, title, rating, @creator (opens their profile) and the first tag or
    cuisine.
- "Home cooks to follow" was replaced by Suggested for you, so the same people don't show
  twice on one screen.

**Search → Creations** is now ranked by relevance: exact title, then titles starting with
the query, then a word in the title, then anywhere in the title, then tag and category
matches. Newest first within each tier.

**Database** (`20261027000001_taste_discovery.sql`, **not pushed**):
- `taste_topics` and `taste_posts`: SECURITY INVOKER, so posts RLS hides private, blocked,
  draft and removed content.
- `search_creations`.
- `suggested_friends` gains `mutual_count`, with the same ranking.

**Recommendation logic:**
- Taste is computed from posts you make (weight 3), like (2) and save (2).
- Topics score: your weight + how many posts there are to browse + fresh activity + a
  small daily shuffle. Topics with fewer than 2 posts are hidden, and identical names
  (a "Korean" cuisine and a #korean tag) are merged.
- Creations score: overlap with your taste + rating above 6 + likes (capped) + recency +
  the daily shuffle. Excluded: your own posts, posts you liked or saved, and posts without
  photos. Each cook gets at most 2 spots before anyone's third.
- New users fall back to popular topics and well-rated recent posts.

**Tests:**
- 431 pass: 240 database (12 new: privacy, blocks, drafts, dedupe, Budget Eats, ranking,
  per-cook cap, paging, anon lockout, mutual count, ranked search) and 191 app (new
  LikeButton test: the count doesn't toggle the like).
- Typecheck and lint are clean.

**Simulator** (iPhone 16 Pro Max, @chefshin, read-only):
- Feed "Liked by" and the count both open the sheet ("2 likes", your row without a button,
  Christian "Following"). A row opens the profile, and Back returns. The like was
  unchanged.
- Discover shows Suggested for you under search.
- Find Friends shows suggestions, and searching "helen" gave the match, then You might
  also know, then Invite.

**Migration `20261027000001_taste_discovery` is live (pushed 2026-10-27, approved).**
- `migration list` shows it on the remote.
- Signed-out callers are refused by `taste_topics`, `taste_posts` and `search_creations`
  (401, "permission denied").
- Build 10 is unaffected: it ignores the extra `mutual_count` column.

**Checked in the simulator after the push (read-only, @chefshin, 2026-10-27):**
- For Your Taste sits directly under the Discover search bar:
  - personal chips: Chinese 13, Italian 12, American 10;
  - real cards showing photo, title, creator, rating and a tag or cuisine line.
- Taps:
  - the Chinese chip opens Browse filtered to Chinese;
  - the creator name opens @helenkwok's profile;
  - the card opens the post, which @chefshin hasn't liked.
- `/taste` (See all) shows chips plus a grid. The last chip ("Indian 2") scrolls fully into
  view. The grid ends after 8 creations: that's every candidate left once own, liked and saved
  posts are excluded, so paging past 18 is covered only by the DB test.
- Ranked search:
  - "chicken" and "salmon" put titles starting with the word first, then other titles, then
    tag or category matches;
  - "salmonzz" and "tofu" show "No results" (the live DB also returns 0 for "tofu").
- People you may know: live data has only 2 suggestions (each with 1 mutual). Both show as
  Suggested cards, so the PYMK list correctly stays hidden; it lists suggestions after the
  first 10.

**Open issue:**
- Right after the push, two searches ("chicken", "chickenpasta") showed "Couldn't load this"
  on the first try and worked on Try again.
- It didn't happen on 4 later searches, and the same SQL succeeds on the live DB (62 ms for a
  no-match query). Likely a brief lag right after the migration, but not proven. Watch for it.
- Separately, the shared `GridSkeleton` loading grid draws tiny squares. That's existing
  behaviour, unchanged here.

## UI polish, branding & content clarity (2026-10-28, branch `ui-polish-branding`)

**1. Pizza moves from Baking to Cooking** (migration `20261028000001_pizza_to_cooking`, live since 2026-10-28, approved)
- Cooking classifies by dish type (its quick pick is Cuisine), so Pizza is now a Cooking dish
  type after Pasta. Giving Cooking a one-item "What kind?" list would have broken its flow.
- Baking › Pizza is retired (`is_active = false`), not deleted. The 2 live posts tagged with it
  keep their label. Pickers, quick picks and search no longer offer it, and typing "Pizza" as a
  custom Baking label is refused (in the app and in `ensure_custom_category`).
- Editing an old Baking › Pizza post shows the tag as selected and keeps it on save unless the
  owner removes it. The app now loads retired rows (`Taxonomy.retired`) for this.

**2. "Most loved" → "Most liked"** (Discover row, its See all title, Browse sort chip)
- Sorting was already by like count (then newest) in `discover_posts` and the client
  re-sort. A new DB test proves it ranks by likes, not rating, and leaves out unliked posts.

**3. Wordmark period:** already Espresso #3B2A22 everywhere (app `Wordmark`, website CSS, app
icon, splash), since 2026-10-20. No change needed; checked on screen in the simulator and the
browser (computed `rgb(59, 42, 34)`).

**4. Welcome screen and cheffy.me hero:** "Your kitchen has a fan club now." (display serif)
over "Cook it. Rate it. Share it." (oxblood; semibold in the app, semibold italic on the
site). The app reads `TAGLINE` in `src/constants/app.ts`; the static site can't import it, so
`web/index.html` carries the same lines with a pointer. Buttons, motto and animations are
unchanged. The native splash has no tagline and is untouched.

**5. Feed divider:** the espresso rule above the heart/comment row is gone. The feed's soft
divider between posts marks where an entry ends. Order and touch targets are unchanged; Co-Chef
posts use the same card.

**6. Review and story:** a shared `StorySection` replaces `StoryTeaser` (feed) and
`StoryBody` (post screen). The review and story both use the `body` style (16/23); the story
has an oxblood "The story" label and the existing thin oxblood left rule. Long stories (over 240
characters or more than one paragraph) show "Read story · N min" / "Show less": collapsed to 3
lines in the feed, open on the post screen. Paragraph breaks are kept.

**Checked:**
- 441 tests pass (new: retired taxonomy, edit keeps a retired tag, Pizza migration, custom
  re-add refused, Most liked order, story length rule). Typecheck and lint are clean.
- Website (local): hero at desktop and 375 pt widths, no sideways scroll.
- Simulator (signed out): welcome screen on iPhone 16 Pro Max and iPhone 16e (390 pt, the
  smallest available), no clipping.

- Live DB after the push: Cooking dish type Pizza is active; Baking › Pizza is inactive with
  its 2 posts unchanged; re-adding "Pizza" under Baking is refused (checked as @chefshin,
  rolled back).
- Simulator (iPhone 16e, signed in, read-only; nothing liked, saved or posted):
  - feed: no rule above the actions; the soft divider sits under "Liked by"; a short story
    shows in full with its line break;
  - post screen ("Jalapeño cheddar bread", 428-character story): review and story in the
    same type, paragraphs kept, "Show less" / "Read story · 1 min" toggle both ways;
  - Discover shows "Most liked"; See all shows the "Most liked" chip, and its order matches the
    live like counts (5, 5, 5, 5, then 4), not ratings;
  - Create: Baking's "What kind?" has no Pizza, and typing "pizza" shows "Pizza isn't offered
    here any more" with no Add; Cooking's dish types find Pizza; the entry was discarded and
    no post was created;
  - Edit of @chefshin's "mushroom arugula pizza" (Baking › Pizza) shows Pizza selected; closed
    without saving.

**Notes:**
- Taps inside a list are ignored while it is still moving (after a scroll, or right after the
  story changes height). That's standard iOS behaviour; a settled tap toggles first time.
- The live site updates when this branch merges to main.

## Welcome screen art direction & story color (2026-10-28, branch `ui-polish-branding`)

**Removed:** "Club de cuisine" / "Est. MMXXVI" and their rule; "Cook it. Rate it. Share it." under
the logo; the ruled box around Cook / Bake / Pour.

**Welcome screen (`src/app/(auth)/welcome.tsx`):**
- Two groups. The hero (wordmark, one line, Cook / Bake / Pour) is centered in the spare height
  and lifted slightly above true center. The actions and sign-off are anchored at the bottom in
  thumb reach. Spacing comes from flex and theme tokens, not fixed positions.
- Wordmark: all Oxblood, full stop included (the `Wordmark` oxblood tone, so the Home header
  matches). It scales with width (64–84 pt).
- Headline: "Your kitchen has a fan club now." in the old subline's style (Newsreader
  semibold, Oxblood, light tracking) at 17/24. It wraps as "…has a / fan club now.": a
  no-break space keeps "fan club" together and `push-out` line breaking avoids a lone word.
- Cook / Bake / Pour: they play an animation and a haptic, so each now sits on a 64 pt Crème
  disc (deeper while pressed) to show it's tappable. 28 pt icons, equal columns, centered as a
  group under the wordmark. The existing animations are kept, including the Reduce Motion
  fallback.
- Actions: "Create account" (filled) then "Sign in" (outlined), both 54 pt, 12 pt apart, same
  destinations (`/sign-up`, `/sign-in`).
- Sign-off: "Cook. Rate. Share. Repeat." in `textSecondary` (was tertiary) for contrast, kept
  clear of the home indicator.
- It's a non-bouncing scroll view that only scrolls when large text needs the room.

**Story color:** in `StorySection` the story text is now Oxblood like its label, the same size
as the review. The review stays Espresso. Feed and post screen share the component.

**Not changed:** the display font is still DM Serif Display. `DESIGN_SYSTEM.md` names Bodoni
Moda, but the logo was asked to keep its typography. The app icon, splash image and website
wordmark still have an Espresso full stop (images and site CSS; a new build is needed for the
icon and splash).

**Checked:**
- 441 tests pass; typecheck and lint are clean.
- iPhone 16 Pro Max (signed out): default text, and the largest accessibility text size (text
  grows up to the app's 1.3× cap, no clipping or overlap, buttons on screen; reset after).
  Tapping Cook plays its wiggle.
- iPhone 16e (signed in): the feed shows the review in Espresso and the story in Oxblood at
  the same size; the Home wordmark is all Oxblood.
- Not yet: the redesigned welcome screen on a small iPhone. The spare iPhone 16e simulator is
  waiting for access in the simulator panel.

## Drafts: findable and safe (2026-10-29)

**Recovery check first (read-only, live project).** Drafts are only ever stored
as `posts` rows with `status = 'draft'`, written when "Save draft" is tapped.
Nothing was kept on the phone before this change. @chefshin had **no drafts**
(all 15 posts published), @simonshin007 had none either, and there were no
photo uploads in @chefshin's storage folder without a post. So the missing
entry was never saved (closed or discarded before Save draft) and can't be
recovered. The Drafts screen existed but was reachable only from Settings and
a "N drafts to finish" row on your own profile.

What changed:
- **Drafts button on Create** (new entries), with the number of saved drafts.
- **Drafts screen**: reopen, edit, publish (as before), plus **delete** with a
  confirmation. Also lists an unsaved entry kept on this phone.
- **Leaving Create with changes always asks**: close button, swipe, Android
  back, opening Drafts → "Save this entry as a draft?" with Save draft /
  Discard / Keep editing (`usePreventRemove`). Editing a published post only
  offers Discard / Keep editing.
- **Safety copy on the phone** (`composeRecovery.ts`, AsyncStorage, one slot
  per account): written as you type (500 ms), when the app goes to the
  background and when Create closes for any other reason (e.g. sign-out).
  Cleared after a successful save or a deliberate discard. Next time Create
  (or that draft) opens: "Pick up where you left off?" Restore / Start fresh.
  It keeps the same post id, so a retry after a half-finished save updates
  instead of duplicating. Sign-out dialog says when an unsaved entry is kept.
- **"Made with" people** on drafts are now remembered (on this phone, per
  draft), since they're only invited once the entry is posted.
- **Missing photos**: picked photos whose files are gone are dropped on
  restore with a notice; at save time the check runs before any upload and
  removes them with a clear message. Uploaded photos that can't be found show
  as blank tiles; a draft can still be saved, but posting asks you to remove them.
- **Failed saves** keep the entry on screen and on the phone; finished uploads
  aren't redone on retry.

No migrations; no change to existing drafts. Server-side, drafts were already
author-only: `tests/db/drafts.test.ts` (11 tests) proves every field, photo,
tag and category round-trips, and that a follower or stranger can't read the
draft, its photos (rows or storage files), tags or categories, can't edit,
publish, delete, like, comment on or save it, and doesn't see it in the diary.
Unit tests: `composeRecovery.test.ts` (per-account copy, corrupt data,
missing photos, Made with), `save.test.ts` (missing-photo stop before upload,
full draft payload, retry reuses uploads).

Not verified in the simulator (it's signed in to the real account and Metro
serves another branch). Known limits: the safety copy holds one unsaved entry
per account; "Made with" for drafts doesn't follow you to another phone.
## New to Cheffy (2026-10-29, branch `new-to-cheffy`)

**Database** (migration `20261029000002_new_members`, live since 2026-10-29, approved):
- `new_members(limit, offset)` returns every eligible account, newest first (`profiles.created_at`),
  paged and capped at 50. Eligible means:
  - a verified email, not suspended or banned, `discoverable`;
  - not blocked either way;
  - not already followed, requested or dismissed by the viewer, and never the viewer.
  - Deleted accounts have no profile, so they never appear. Private accounts can appear
    (Follow becomes Requested).
  - Security definer, authenticated only.
- `suggested_friends()`:
  - accounts that joined in the last 30 days now qualify on their own with the reason "New to
    Cheffy", so a brand-new cook with no posts or mutual friends can still be suggested;
  - stronger reasons still rank first;
  - suggestions now also require a verified email.
- Numbered `…000002` because the comment-media session had already pushed its own
  `20261029000001` to the live DB. To push from this branch, a temporary copy of that file was
  added and removed again (no `migration repair`).

**App:**
- `NewToCheffy` row of compact cards: photo, name, @username, "Joined today / yesterday /
  Oct 27", a crème "NEW" tag for the last 14 days, Follow, tap opens the profile. It scrolls
  sideways and has See all.
- `/new-members` (See all) lists every eligible member, paged, with pull to refresh.
- Where it appears:
  - Discover, under Suggested for you;
  - Find Friends, under Suggested;
  - Search › People, above the suggestions;
  - under the empty Following feed (fetched only when that empty state shows).
- No one appears twice on a screen (`splitDiscoveryPeople`): someone suggested for a stronger
  reason stays in Suggested; someone suggested only for being new moves to the New row.
- Cached under `['users', …]`, so Follow / Following / Requested update everywhere at once.
  It refreshes after a minute and on focus, so new sign-ups appear quickly.
- `SuggestionCard` takes a `detail` line, an optional `badge` and an optional dismiss.

**Checked:**
- 465 tests pass (new: 11 DB tests for ordering, every exclusion rule, paging without repeats,
  someone joining later, anon refused, the 30-day window and ranking; 4 unit tests for
  de-duplication and labels). Typecheck and lint are clean.
- Live data (@chefshin, read-only): suggestions went from 2 to 12, 7 of them "New to Cheffy";
  `new_members` returns 13 eligible accounts.
- Simulator (iPhone 16e, signed in, read-only; confirmed no follows, requests or dismissals
  were made):
  - Discover shows New to Cheffy with NEW tags; @eminmd14, who signed up during the check,
    appeared first; the row scrolls sideways; nobody is in both rows;
  - See all lists all 13, newest first, no repeats;
  - Find Friends and Search › People show the row.
- Not checked: the empty Following state (@chefshin's feed isn't empty), live paging past 20
  (only 13 eligible; covered by the DB test), and tapping Follow on a real account.
## Search suggestions for Creations and Tags (2026-10-29; migration not pushed)

Search's Creations and Tags tabs now show personalized suggestions while the search box is
empty, like the People tab already does. Typing shows search results only. Clearing the box
brings the suggestions back from cache, without a reload. Discover's navigation is unchanged.

**Creations tab, empty query** (`CreationSuggestions` in
`src/features/discover/components/SearchSuggestions.tsx`):
- **For Your Taste:** the existing `taste_posts` picks, built from what the viewer makes,
  likes and saves, plus ratings and recency. See all opens `/taste`.
- **Trending:** `trending_creations()`, public creations ranked by likes and comments from
  the last 14 days. The last 7 days count double, and only one comment per person counts.
  Lifetime likes don't count. See all opens the new `/trending` screen, which is paged and
  shares the row's cache.
- **Newly Cooked:** `newly_cooked()`, creations from the last 90 days by discoverable,
  public, unsuspended accounts. Each cook's newest creation comes first, so a new cook isn't
  buried by a prolific one. It's an endless paged grid under the two rows.
- Each creation appears once, in the first section that has it (For Your Taste, then
  Trending, then Newly Cooked). Empty sections are hidden. If every section is empty, the
  screen shows the old "Find something to make" hint. A one-letter query shows "Keep typing".

**Tags tab, empty query** (`TagSuggestionList`, backed by `tag_suggestions()` in one call):
- **Suggested for you:** tags on the viewer's own posts (weight 3, or 5 when rated 8+), likes
  and saves (2), comments (1), and recent posts by people they follow (1).
- **Popular tags:** ranked by recent use. The last 14 days count most, then 60 days, then
  all-time use and the number of different cooks.
- **Explore something new:** a few popular tags (2+ posts) the viewer has no history with,
  shuffled a little each day.
- Each tag appears in one list only. Every tag has at least one other person's post the
  viewer can browse, so Browse is never empty. Tapping a tag opens `/browse` with `tagId`.
  Rows show the creation count. Typed tag results use the same `TagRow`.

**Fallbacks for new users:** `taste_posts` already falls back to popular, well-rated recent
posts. A viewer with no activity gets no "Suggested for you" tags (until they follow someone),
but still sees Popular and Explore. Newly Cooked never depends on the viewer's activity.

**Privacy:** all three new functions are SECURITY INVOKER, so the posts RLS policy applies.
Private and followers-only posts the viewer can't open, people blocked either way, drafts and
removed posts never show up. Trending and Newly Cooked also require public visibility, a
public account and no suspension. Newly Cooked also requires `discoverable`. The viewer's own
creations are never returned. All three are revoked from `anon`.

**Migration:** `supabase/migrations/20261030000001_search_suggestions.sql` (read-only
functions, no data changes). **Not pushed to the live database.** The app needs it live
before the new sections fill in. Until then, the Trending, Newly Cooked and tag requests fail,
those sections stay hidden, and For Your Taste still works.

**Checked:**
- `tests/db/search-suggestions.test.ts` (11 tests). Trending: ranks recent engagement over
  lifetime likes, weights recent days higher, ignores the cook's own likes and comments,
  leaves out own, private, followers-only, blocked (both ways), removed and photo-less posts,
  caps each cook at two before anyone's third, and pages without repeats. Newly Cooked: same
  exclusions, plus non-discoverable accounts and posts over 90 days old, and the
  newest-per-cook order. Tags: section order and dedupe, ranking by recent use, learning from
  likes, the follow and brand-new-user fallbacks, nothing from own, private, blocked, draft
  or removed posts, and no anon access.
- Full test suite, typecheck and lint pass.
- **Migration live** (2026-10-30, approved). Live data for @chefshin (read-only): Trending
  and Newly Cooked each fill a first page of 18 with none of their own posts; tags return 8
  suggested and 12 popular. Explore is empty for this account because every popular tag
  connects to something they made, liked, saved or follow, so it's correctly hidden.
- Simulator (iPhone 16e, signed in, read-only): Creations shows For Your Taste, Trending and
  Newly Cooked with real posts; Tags shows Suggested for you and Popular tags; tapping #matcha
  opens Browse with its 2 creations.
- The Trending subtitle reads "Getting the most likes and comments lately" (it said "Most
  loved", which the app no longer uses).

## Discovery query speed (2026-10-30, branch `discovery-indexes`)

Measured on the live DB as @chefshin (`explain analyze`, 3 runs each; 37 profiles, 120 posts,
303 likes, 208 comments):

| Function | Before | After |
| --- | --- | --- |
| `trending_creations` | ~237 ms | ~15 ms |
| `newly_cooked` | ~90 ms | ~11 ms |
| `new_members` | ~8 ms | ~8 ms (now indexed) |

- **Cause:** both functions ran with the caller's rights, so every post, like and comment they
  read re-ran the posts visibility policy (~0.4 ms a row). Indexes alone wouldn't have helped.
- **Fix** (migration `20261030000002_discovery_speed`, live since 2026-10-30, approved):
  - both functions only return public posts from public accounts, so they now apply that rule
    once, explicitly (published, public, public unsuspended author, not blocked either way,
    not the viewer's own), as `new_members` already did;
  - Trending starts from the last 14 days of likes and comments instead of every post;
  - indexes on `profiles(created_at desc, id desc)`, `likes(created_at)` and
    `comments(created_at)`.
- **Same results:** the existing privacy tests (22 in `search-suggestions` and `new-members`)
  pass unchanged. Live check: no own or non-public posts returned. 498 tests pass.
- **Still slow, not changed:** `tag_suggestions` (~375 ms) and `taste_posts` (~275 ms), for
  the same reason. They include followers-only posts the viewer may see, so a correct fix
  needs the follower rule applied once per post rather than dropped. That's a follow-up.
