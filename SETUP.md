# Cheffy — Setup Guide

Everything you need to run Cheffy against a real backend, on two iPhones, and
eventually ship it. No secrets live in this repo.

## 0. Local tooling

- **Node 22.13+** (Expo SDK 58 / React Native 0.88 requirement). If your default
  `node` is older, put a newer one first on your PATH.
- Xcode + iOS Simulator (only for the simulator; phones can use Expo Go).

```bash
npm install
npm run check
```

`npm run check` runs typecheck, lint, the app tests, and the database tests
(the migrations run in an in-process Postgres, with no Docker needed).

## 1. Supabase project (≈10 minutes)

1. Create a project at <https://supabase.com/dashboard>. The free tier is fine.
   Pick the region closest to you and your friend.
2. **Apply the database schema.** Choose one option:

   **Option A, CLI (recommended).** Run these from the repo root:

   ```bash
   npx supabase login
   ```

   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

   ```bash
   npx supabase db push
   ```

   `link` asks for the database password you chose when creating the project.

   **Option B, dashboard.** Open SQL Editor and run each file in
   `supabase/migrations/` **in filename order** (01 → 06).

   Both options create the tables, RLS policies, functions, the `avatars` and
   `post-images` storage buckets, and the category taxonomy. There's no fake data.

3. **Auth settings** (Dashboard → Authentication):
   - *URL Configuration* → Site URL: `cheffy://`
   - *URL Configuration* → Redirect URLs: add `cheffy://**` and, for Expo Go
     during development, `exp://**`
   - *Providers → Email*: enabled. Set minimum password length to 8.
   - *Confirm email*: if it's **on** (the safer default), people must tap the
     link in their email before signing in. Open the link on the same phone you
     signed up on. For a quick two-friend test you can turn it **off** and turn it
     back on before launch.
   - Supabase's built-in email sender is rate-limited to a few emails per hour.
     Before real users arrive, configure custom SMTP (Authentication → Emails →
     SMTP Settings) with a provider such as Resend or Postmark.

4. **API keys** (Dashboard → Project Settings → API): copy the **Project URL** and
   the **publishable (anon) key**. They're public by design, because RLS protects
   the data. **Never** put the `service_role` / secret key in the app.

5. Create `.env.local` in the repo root:

   ```bash
   cp .env.example .env.local
   ```

   Then fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## 2. Run it

**Simulator:**

```bash
npm run ios
```

**Two real iPhones, no Apple Developer account needed:** install **Expo Go**
from the App Store on both phones, then start the dev server with a tunnel so
both phones can reach it from any network:

```bash
npx expo start --tunnel
```

Each person scans the QR code with the iPhone Camera app. Both phones talk to
the same Supabase project, so accounts, follows, posts, likes and comments are
shared for real.

## 3. TestFlight (installable builds)

You need a paid **Apple Developer Program** membership ($99/year).

1. Check the bundle identifier in `app.json` (`com.audreyshin.cheffy`). Change it
   now if you want, because it can't change after the first App Store Connect upload.
2. Log in to EAS and link the project. This adds `extra.eas.projectId` to `app.json`:

   ```bash
   npx eas-cli@latest login
   ```

   ```bash
   npx eas-cli@latest init
   ```

3. Store the public Supabase values as EAS environment variables (visibility
   "Plain text"). Builds don't read `.env.local`:

   ```bash
   npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR-REF.supabase.co --visibility plaintext
   ```

   ```bash
   npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR-ANON-KEY --visibility plaintext
   ```

4. Build. EAS creates and manages the signing certificates:

   ```bash
   npx eas-cli@latest build --platform ios --profile production
   ```

5. Submit to App Store Connect. This creates the app record if needed:

   ```bash
   npx eas-cli@latest submit --platform ios --latest
   ```

6. In App Store Connect → TestFlight, add your friend as a tester. *Internal*
   testers must be on your App Store Connect team. *External* testers can use a
   public link after a short Beta App Review.

## 4. Before App Store review

Required or strongly expected. Most of it is already built:

| Item | Status |
| --- | --- |
| Account deletion in-app | ✅ Settings → Delete account (deletes data + photos) |
| Report content and users | ✅ Posts, comments, profiles |
| Block users | ✅ Hides content both ways; Settings → Blocked accounts |
| Terms / zero-tolerance policy accepted at sign-up | ✅ `terms` screen + sign-up checkbox |
| Published developer contact | ⚠️ Set `SUPPORT_EMAIL` in `src/constants/app.ts`, plus a Support URL in App Store Connect |
| A way to act on reports within 24h | ⚠️ Reports land in the `reports` table. Review them in the Supabase dashboard; delete offending rows or users there |
| Privacy policy URL | ⚠️ Host a page (the Terms screen text is a starting point) and add it in App Store Connect |
| Privacy "nutrition label" | Declare: Email address, User ID, Photos, Other user content. All linked to the user, used for App Functionality, **not** used for tracking |
| Photo permission strings | ✅ `app.json` → `ios.infoPlist` / image-picker plugin |
| Encryption export compliance | `usesNonExemptEncryption: false`. The app only uses HTTPS and standard OS/AES encryption to protect the local session |

Approval is never guaranteed. These items cover the review issues apps with
user-generated content most often hit.

## 5. Regenerating typed database bindings (optional)

The app declares row types next to each query (`src/features/*/api.ts`). Once
the project is linked, you can generate full types for reference:

```bash
npx supabase gen types typescript --linked > src/types/database.generated.ts
```
