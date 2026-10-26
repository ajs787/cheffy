# Cheffy 1.0 — App Store Connect product page (English, U.S.)

Ready to paste. Everything in **Values** was checked against the current build (1.0.0, build 10)
and Apple's limits. Items marked **Owner** need information only you have; nothing here is
invented.

## Values

| Field | Value | Length / limit |
|---|---|---|
| Name | `Cheffy` (see "App name" below) | 6 / 30 |
| Subtitle | `Your Social Cooking Diary` | 25 / 30 |
| Promotional text | `Your kitchen diary, but social. Log what you cook, bake, and pour, rank your favorites, and see what your friends are making.` | 125 / 170 |
| Keywords | `home cooking,food diary,recipe journal,meal tracker,baking,homemade,food photos,drink journal` | 93 / 100 bytes |
| Primary category | Food & Drink | — |
| Secondary category | Social Networking | — |
| Support URL | `https://cheffy.me` (contact link: hello@cheffy.me) | 200 OK |
| Marketing URL | `https://cheffy.me` | 200 OK |
| Privacy Policy URL | `https://cheffy.me/privacy/` | 200 OK |
| Terms (EULA, optional) | `https://cheffy.me/terms/` | 200 OK |
| Version | 1.0.0 (`app.json` → `expo.version`) | — |
| Copyright | **Owner:** `2026 <legal name of the account holder or company>` | — |

URLs were checked on 2026-10-26 (all returned HTTP 200).

**Keyword notes:**
- Keywords don't repeat the app name or the categories, as Apple advises.
- "meal tracker" is accurate in that Cheffy logs meals with a meal type. It is not a calorie
  tracker, so drop it if you'd rather avoid that reading.
- Apple matches single words across the whole field, so spaces inside phrases cost
  characters without adding much. `recipe journal` and `drink journal` both earn their
  place.

### Description (1,402 characters; limit 4,000)

```
Cheffy is a diary for everything you make: what you cook, bake, and pour. Snap a photo, rate it from 0 to 10, and watch your own rankings take shape. Then see what your friends are making.

YOUR KITCHEN DIARY
• Log dishes, bakes, and drinks with photos, a 0–10 rating, a review, and the story behind it
• Add the details you want to remember: cuisine, meal, time, ingredients, notes for next time, and a recipe link
• Keep entries public, for followers only, or just for you

RATE IT. RANK IT. REMEMBER IT.
• Your creations ranked automatically, by category, cuisine, and tag
• See your average, your most-made category, and your all-time best
• Save other people’s creations to make later and group favorites into collections

SEE WHAT YOUR FRIENDS ARE COOKING
• Follow friends and see their latest creations in your feed
• Like and comment, and reply to comments
• Find friends by name or username, or invite them
• Make your account private and approve who follows you

MADE TOGETHER, RATED YOUR WAY
• Cooked with friends? Invite them as co-chefs on one creation
• Everyone adds their own rating and review, and it counts in their own rankings

A SAFE TABLE
• Report any post, comment, or account, and block anyone
• Our team reviews reports, and our Community Guidelines have zero tolerance for abuse
• Delete your account and everything in it at any time, right from Settings

No ads. No tracking.
```

Every bullet was checked against the build:
- the 0–10 rating input;
- the rankings tab with category, cuisine and tag filters;
- stats on the profile;
- Saved and Collections;
- the Following feed;
- comment replies;
- Find Friends and Invite;
- private accounts with follow requests;
- Co-Chef invitations with separate ratings;
- Report and Block on posts, comments and profiles;
- account deletion in Settings;
- no analytics or ad SDKs in `package.json`.

The description deliberately leaves out "Most Hated", "Budget Eats" and the moderation
dashboard. They exist, but they aren't core to the pitch and are better left to
screenshots or a later update.

## App name: "Cheffy (3a0e77)"

- **App's own name (`app.json`):** `name: "Cheffy"`, with no `CFBundleDisplayName`
  override. The name under the icon on the home screen is therefore **Cheffy**. The build
  contains no "(3a0e77)", so no code change is needed.
- **App Store Connect:** the suffix belongs to the app record's **Name** (App Store
  Connect → your app → App Information → Localizable Information → Name). EAS Submit
  creates the app record on first submit. When the plain name is already taken on the App
  Store, it adds a random suffix like this one.
- **"Cheffy" alone:** store names must be unique across the whole App Store, and the
  suffix is strong evidence that "Cheffy" is already taken. I can't check App Store
  Connect from here.
- **What to do (Owner):** in App Information, set the Name to `Cheffy`. If App Store
  Connect says it's unavailable, use a unique name of up to 30 characters that starts with
  Cheffy. The TestFlight invite already shows **"Cheffy: Rank Your Creations"** (27
  characters), which suggests that name was accepted for the beta. Other options are
  `Cheffy: Cooking Diary` (21) or `Cheffy – Social Cooking Diary` (29).
- **Don't** delete or recreate the app record. The home-screen name stays "Cheffy"
  whichever store name you pick.

## Screenshots

**Required:** the 6.9" iPhone set, 1320 × 2868 portrait, 3 to 10 images. iPad isn't
needed (`supportsTablet: false`).

**Current assets:** the images in `web/images/` are 720 × 1561 (website crops). Earlier
simulator shots are 1179 × 2556 (6.1"). **Neither size is accepted for the required set.**

**How to capture (Owner, about 20 minutes):**
1. Use an iPhone 16 Pro Max simulator (6.9", 1320 × 2868) and build 10's code, signed in
   to the review/demo account with real content.
2. Take each shot with `xcrun simctl io booted screenshot`.

**Captions you proposed, and the real screen each should show:**

| # | Caption | Screen (must be real) |
|---|---|---|
| 1 | Your kitchen diary, but social. | Home feed with real posts and the comment preview |
| 2 | Everything you make, in one place. | Profile → Diary grid |
| 3 | Rate it. Rank it. Remember it. | My Rankings |
| 4 | See what your friends are cooking. | A post detail, or Find friends |
| 5 | Made together, rated your way. | A Co-Chef post showing each co-chef's rating |

- **Overlays:** add captions with any tool, using DM Serif Display on ivory with oxblood
  text, as on the site. Don't add features or content the app doesn't show.
- **People:** only use photos and usernames of people who have agreed to be shown.

## App Review information (Owner, in App Store Connect only, never in git)

- ☐ **Demo account:** a dedicated, verified account (not your personal one). Give it 2–3
  real posts, one co-chef post, a follow and a comment.
- ☐ **Demo email:** use one you control (a cheffy.me address routed through Cloudflare
  Email Routing works).
- ☐ **Demo password:** enter it only in App Store Connect.
- ☐ **Contact first and last name, phone and email:** your real details. I can't supply
  these.
- ☐ Sign in to the demo account on build 10 once before submitting, to confirm it works.

### App Review Notes (paste; fill the angle brackets)

```
Demo account: <email> / <password> (verified, with posts, follows and comments).

User-generated content safety (Guideline 1.2):
• Everyone accepts the Terms and Community Guidelines (zero tolerance for objectionable content or abusive users) when signing up.
• Report: any post's "•••" menu → Report; long-press a comment → Report; any profile's "•••" menu → Report.
• Block: any profile's "•••" menu → Block. Blocked users can't see or interact with each other. Settings → Blocked accounts to unblock.
• Reports go to our moderators, who are alerted and review them in a moderation dashboard within 24 hours. Violating content is removed and abusive accounts can be suspended. Content reported by several people is hidden automatically pending review, and slurs are filtered.

Account deletion (Guideline 5.1.1(v)): Settings → Delete account permanently deletes the account and all its posts, photos, comments and likes.

Contacts are read only on the device to find friends who already use Cheffy and are never uploaded.
```

Only state "moderators are alerted" if the email alert is configured before submission.
See `MODERATION_ADMIN_GUIDE.md` → Alerts. Otherwise change that line to say reports are
reviewed daily in the dashboard.
