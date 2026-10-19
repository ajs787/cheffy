# Two-Device Acceptance Test

The MVP is complete when every step below passes on **two physical iPhones**
against the **real Supabase project** (no seed data). Record the date, build and
result of each run at the bottom.

**Setup:** finish SETUP.md §1, then run the app on both phones (Expo Go with
`npx expo start --tunnel`, or a TestFlight build). Person A uses phone A and
person B uses phone B. Use two different email addresses.

## Part 1: User A

| # | Step | Expected |
| --- | --- | --- |
| A1 | Open Cheffy → **Create an account**; enter email + 8+ char password; tick Terms; **Create account** | If email confirmation is on: "Check your inbox". Tap the link on phone A, and Cheffy opens to onboarding. Otherwise onboarding appears immediately |
| A2 | Onboarding: add a photo (optional), name, username (shows "Available"), bio → **Start cooking** | Home tab with the "Cheffy is better with friends" empty state |
| A3 | Tap **+** → add 1–3 photos of the matcha → name "Iced Strawberry Matcha" → **Drinks** → **Matcha** chip | Photos show with "Cover" on the first |
| A4 | Rating: drag the slider, then tap the number and type `9.2` → done | Big number shows **9.2** in green, "Exceptional" |
| A5 | Review text; tags `iced`, `strawberry`; More details → Served **Iced**, Milk **Oat**; Visibility **Public** → **Post** | Upload progress, then "Logged to your diary". The post is at the top of Home |
| A6 | Profile tab → **Diary** shows the post; **Rankings** shows `1  Iced Strawberry Matcha  9.2` | Counts: 1 creation, Drinks 1 |

## Part 2: User B

| # | Step | Expected |
| --- | --- | --- |
| B1 | Create a separate account and profile (A1–A2 on phone B) | Empty Home |
| B2 | Home → **Find friends** (or Search → People) → type A's username | A appears with a **Follow** button |
| B3 | Tap **Follow** | Button flips to **Following** |
| B4 | Go to Home, pull to refresh | A's matcha post appears with photos, 9.2, review and tags |
| B5 | Tap the heart (or double-tap the photo) | Heart fills, count shows **1** |
| B6 | Tap the comment icon → type "Looks amazing!" → **Post** | Comment appears under the post |
| B7 | From A's profile (tap their name): browse **Diary** and **Rankings** | Shows A's matcha ranked #1 |
| B8 | Log one post of B's own (any category, Public) | It shows in B's diary and rankings |

## Part 3: User A again

| # | Step | Expected |
| --- | --- | --- |
| A7 | Home → pull to refresh → open the matcha post | Like count **1**, comment "Looks amazing!" by B |
| A8 | Search → People → B → **Follow** | Following |
| A9 | Open B's profile → Diary / Rankings | B's public post(s) are shown and ranked |

## Part 4: Both

| # | Step | Expected |
| --- | --- | --- |
| X1 | Profile → ⚙︎ → **Sign out** → sign back in | All posts, likes, comments, follows and rankings are still there |
| X2 | On B's phone, open A's post → ••• | Options are Add to collection / Share / **Report** / **Block**. There's **no Edit or Delete** |
| X3 | On A's phone, open A's own post → ••• → Edit post → change rating to 9.4 → **Save changes** | Rating updates in the feed and in rankings on both phones (pull to refresh) |
| X4 | A sets a post to **Only me** (edit → Who can see this) | It disappears from B's feed and from A's profile as seen by B |

The database also enforces X2 and X4 independently of the UI. See
`tests/db/posts.test.ts` and `tests/db/visibility.test.ts`.

## Results log

| Date | Build | Tester(s) | Result | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-19 | Expo Go dev (simulator) | Audrey + Claude | Part 1 (A1–A6) passed with one account | Parts 2–4 need a second account / device |
