---
name: cheffy-ui-review
description: Check a Cheffy screen or component change for design-system consistency, layout regressions, keyboard behaviour, accessibility and native iOS feel. Use after changing anything under src/app or src/components, or when the user says /cheffy-ui-review.
---

# Cheffy UI review

## 1. Scope
`git diff main...HEAD --stat -- src/app src/components src/features/*/components` lists the
changed screens. Note every place the changed component is used (search its name). Shared
pieces like `PostCard`, `LikeButton` and `AppHeader` appear on several screens.

## 2. Static checks (fast, deterministic)
In the changed files:
- No hex colours or raw font names: `grep -nE "#[0-9A-Fa-f]{3,8}\b|fontFamily: '" <files>`.
  Use `colors`/`fonts` from `@/theme`.
- Spacing comes from `spacing.*`. A raw number needs a reason in a comment (e.g. row height).
- Text through `AppText` variants. Bodoni (`display`/`title1`/`title2`) only ≥ 18pt.
- Every `Pressable`/`IconButton` has `accessibilityRole` and `accessibilityLabel`. Touch
  areas ≥ 44pt (use `hitSlop` when the visual is smaller).
- Lists use FlashList. Images use `FoodImage`/expo-image with thumbnails in lists.
- Text inputs: the keyboard doesn't cover the field, a Done bar where multiline, and
  submitting doesn't double-fire.

## 3. Reviewer
For non-trivial changes, send the diff to the `cheffy-ui-reviewer` agent. Check its findings.

## 4. See it running
- Expo Go on the iOS Simulator for JS-only changes: `npx expo start`, then open the app.
  Check the changed screens at the smallest (iPhone 16e/SE) and largest sizes, with and
  without data (empty, one item, long text, 2–3 digit counts). Take screenshots.
- Native changes (new native module, config plugin, `app.json`): Expo Go isn't enough. Say
  that a development or TestFlight build and a real device are needed.
- The simulator account is the owner's real account: look, don't write, unless they agree.
- If the simulator can't run (e.g. Xcode missing), say so. Don't claim visual verification.

## Done when
Static checks are clean, confirmed reviewer findings are fixed, and the changed screens were
seen running (with screenshots), or the report states exactly what wasn't seen and why.
