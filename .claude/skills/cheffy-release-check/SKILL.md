---
name: cheffy-release-check
description: Pre-build checklist for a Cheffy App Store release, so a production EAS build is made from verified code. Use before running an EAS production build or eas submit, or when the user says /cheffy-release-check. It checks; it does not build, submit or deploy.
---

# Cheffy release check

Read-only. It ends with a go/no-go report. Building, uploading and submitting are separate
steps the owner asks for. **Never submit to App Store Review. The owner does that.**

## Checklist
1. **Source:** on `main`, up to date with `origin/main`, clean working tree. Every PR meant
   for this release is merged.
2. **Checks:** `npm run check` passes (typecheck, lint, all app and DB tests).
3. **Dependencies:** `npx expo-doctor` and `npx expo install --check` report no
   incompatible versions.
4. **Database:** `npx supabase migration list --linked` shows nothing pending. The build must
   not depend on a migration that isn't live, and live migrations must not break the
   previous app version. Advisors show nothing new (see `/cheffy-db-audit` for the baseline).
5. **Native changes:** if `package.json` native modules, `app.json` or config plugins changed
   since the last build, the change was tested in a development or TestFlight build, not
   only Expo Go.
6. **Config:** `app.json` version matches the intended release. The build number is set by
   EAS (`autoIncrement`, remote version source). `eas.json` production profile is unchanged
   or the change is intended.
7. **Secrets:** `git ls-files | grep -iE "\.env|\.p8|\.p12|\.mobileprovision|key"` shows
   nothing sensitive. Only `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY` are public.
8. **Feature flags:** read `public.app_config` read-only (e.g. `anonymous_takes.mode`) and
   confirm they match what the release notes describe.
9. **Release notes:** PROGRESS.md lists what's in the build. Draft "What's New" from it.

## Report
A table of each item with pass / fail / not checked, plus blockers. Then ask the owner
whether to build. Build commands (only after their yes):
`npx -y eas-cli@latest build --platform ios --profile production --non-interactive --no-wait`,
then `submit --platform ios --profile production --id <build-id> --non-interactive` uploads
to App Store Connect without submitting for review.

## Done when
Every item is answered and the owner has the go/no-go report. Nothing was built, uploaded,
pushed or submitted by this skill.
