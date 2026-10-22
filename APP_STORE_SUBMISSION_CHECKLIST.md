# Cheffy — App Store Submission Checklist

Status as of 2026-10-22. ☑ = done and verified, ☐ = still to do. **(You)** marks steps that
need your Apple, Supabase, Cloudflare or email accounts.

## 1. Build

- ☑ Bundle ID `com.audreyshin.cheffy`, Team `J74X34U73R`, App Store Connect app ID `6825135585`.
- ☑ Version 1.0.0. Build numbers are managed remotely by EAS (`autoIncrement`).
- ☑ The production EAS environment has `EXPO_PUBLIC_SUPABASE_URL` and the
  **publishable** key only. No secret key exists anywhere in the app or EAS.
- ☑ App icon 1024×1024, no transparency. The splash screen uses Cheffy ivory.
- ☑ Encryption export answer: `usesNonExemptEncryption: false`.
- ☑ Associated Domains (`applinks:cheffy.me`) enabled; verified on device with build 5.
- ☐ **Production build 6** (`eas build --profile production --auto-submit`) finishes and
  appears in TestFlight. This is the first build that runs without a dev server.
- ☐ **(You)** Full walkthrough on build 6 from TestFlight. Use the checklist in §6.

## 2. Accounts and email

- ☐ **(You)** Turn on Cloudflare **Email Routing** for `hello@cheffy.me`, forwarding to your
  inbox. It's the support contact in the app and on the site, and Apple may write to it.
- ☐ **(You)** Set up **custom SMTP** in Supabase → Authentication → Emails (for example
  Resend). Add the SPF and DKIM records it gives you in Cloudflare DNS, and send from
  `no-reply@cheffy.me`. Supabase's built-in sender is rate-limited and not for production.
- ☐ **(You)** Confirm the Supabase plan. Pro is recommended for launch (no inactivity pause,
  daily backups).
- ☐ Optional: set a moderation alert webhook (Discord or Slack) so reports reach your phone:
  `insert into public.app_config (key, value) values ('moderation.alert_webhook', '"https://…"')`.

## 3. Demo account for App Review

Apple signs in with an account you provide. It must be a real, working account with enough
content to try every feature. **Don't share your personal account.**

- ☐ **(You)** Create it in the app on build 6:
  - email: a mailbox you control, for example `review@cheffy.me` once Email Routing is on;
  - username: something like `cheffy_review`;
  - verify the email by tapping the link.
- ☐ **(You)** From that account:
  - post 2–3 real creations with photos, in different categories, with one rated low;
  - follow @chefshin, and follow it back from @chefshin;
  - leave a comment on one of your posts.
- ☐ Note the password for the Review Notes below. Don't commit it anywhere.

## 4. App Store Connect metadata

| Field | Value |
|---|---|
| Name | Cheffy |
| Subtitle (30 chars) | Your kitchen diary & rankings |
| Primary category | Food & Drink |
| Secondary category | Social Networking |
| Support URL | https://cheffy.me |
| Marketing URL | https://cheffy.me |
| Privacy Policy URL | https://cheffy.me/privacy |
| Copyright | 2026 Audrey Shin |

**Description (draft):**

> Cheffy is a diary for what you cook, bake and pour. Log each creation with photos, rate it
> from 0 to 10, and watch your personal rankings take shape. Follow friends to see what
> they're making — and what they love and hate. Invite friends, co-create dishes together,
> and discover the week's best (and most controversial) home creations.
>
> • Log dishes, bakes and drinks with photos, ratings, reviews and recipes
> • Personal rankings by category, cuisine and tag
> • Follow friends, like and comment, or keep your account private
> • Collaborate on creations with friends
> • Report and block tools, with community guidelines enforced

**Keywords (100 chars):** `food diary,cooking,baking,recipes,home cook,food journal,rate food,drinks,cocktails,friends`

**Screenshots:**
- ☐ 6.9" iPhone set (1320×2868), at least 3 and up to 10. Take them on an iPhone 16 Pro Max
  simulator with real content: My Rankings, a post, logging an entry, Discover, Find
  friends.
- The existing 1179×2556 shots (iPhone 16) are the wrong size for the required set. iPad
  isn't required: `supportsTablet: false`.

## 5. Privacy and ratings

**App Privacy (nutrition label), to match https://cheffy.me/privacy:**

| Data type | Collected | Linked to user | Used for tracking | Purpose |
|---|---|---|---|---|
| Email address | Yes | Yes | No | App functionality (sign-in) |
| Photos | Yes | Yes | No | App functionality (posts, profile photo) |
| Other user content (posts, ratings, reviews, comments) | Yes | Yes | No | App functionality |
| User ID | Yes | Yes | No | App functionality |
| Device ID (push token) | Yes | Yes | No | App functionality (notifications) |
| Contacts | **No**: read on device only, never uploaded | — | — | — |
| Location, health, financial, browsing, diagnostics, analytics | No | — | — | — |

"Data used to track you": **None.** No ads and no third-party analytics.

**Age rating questionnaire:**
- User-generated content: **Yes**. Users can post text and photos, with reporting, blocking,
  moderation and a text filter.
- Messaging and chat between users: comments only, no private messaging.
- No gambling, violence, mature themes or medical content.
- Expected result: **13+** under Apple's current tiers. Use whatever Apple's questionnaire
  produces.

## 6. Review Notes (paste into App Store Connect)

> **Demo account:** email `<review account email>` / password `<password>`. It has posts,
> follows and comments.
>
> **User-generated content safety (Guideline 1.2):**
> • Everyone agrees to the Terms & Community Guidelines (zero tolerance for objectionable
>   content) when signing up.
> • Report: open any post's "•••" menu → Report; long-press any comment → Report comment;
>   open any profile's "•••" menu → Report account.
> • Block: on any profile's "•••" menu → Block. Blocked users can't see or interact with
>   each other. Unblock in Settings → Blocked accounts.
> • Reports are reviewed by our moderators in-app within 24 hours. Content is removed and
>   accounts suspended as needed. Content reported by several people is hidden
>   automatically pending review, and slurs are filtered out.
>
> **Account deletion (5.1.1(v)):** Settings → Delete account, then confirm twice. This
> permanently deletes the account, all photos, posts, comments and likes.
>
> **Contacts:** optional "Invite from contacts" reads contacts on the device only so the
> user can text an invite. Nothing is uploaded.
>
> **Support:** hello@cheffy.me · Privacy: https://cheffy.me/privacy

## 7. Final device walkthrough on build 6 (TestFlight)

- ☐ Sign up with a new email → email link opens Cheffy → "You're verified" → profile setup.
- ☐ Sign out, then sign in. Use "Forgot password" and confirm the reset link opens the app.
- ☐ Log a creation with 2 photos, edit it, then delete it.
- ☐ Follow and unfollow, like and comment, set a private account and approve a follow
  request (needs a second person or account).
- ☐ Report a post and a comment from a second account. They appear in Settings →
  Moderation on @chefshin. Remove one, then restore it.
- ☐ Block a user, check their content disappears, then unblock.
- ☐ Push notification arrives with the app closed (needs a second account).
- ☐ Settings → Privacy policy opens the page; Contact support opens Mail.
- ☑ **Delete account on a throwaway account**, then confirm in Supabase that its user, rows
  and files are gone. Verified 2026-10-22 on build 6.
- ☐ Invite link `https://cheffy.me/invite/CODE` opens the app.

## 8. Submit

- ☐ Attach build 6 (or later) to version 1.0.0, fill in §4–§6, and submit for review.
- ☐ Watch for App Review messages at the Apple ID email and hello@cheffy.me.
