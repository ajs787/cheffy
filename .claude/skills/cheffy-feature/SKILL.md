---
name: cheffy-feature
description: End-to-end procedure for a substantial Cheffy change (new feature, behaviour change, multi-file fix) from understanding to a verified branch. Use when starting any Cheffy work bigger than a one-line tweak, or when the user says /cheffy-feature.
---

# Cheffy feature workflow

For small, obvious edits (copy, a style value, one-line fix) skip to step 7. For everything
else, follow the steps in order. CLAUDE.md holds the rules. This is the procedure.

## 1. Understand what exists
- Find the screens, hooks, `api.ts`, mappers, RPCs and migrations involved (search, don't guess).
- Read the matching PROGRESS.md section. Earlier decisions and trade-offs are recorded there.
- For anything touching Expo/EAS APIs, check the SDK 58 docs (see AGENTS.md) or the
  `expo:*` skills. Don't answer from memory.

## 2. Find the root problem
State in one or two sentences what is wrong or missing and why. Note which existing features
(likes, anonymous takes, blocks, private accounts, co-creators, rankings) the change touches.

## 3. Acceptance criteria
Write 3–6 checkable criteria, including what must *not* change. Share them with the user when
the request is ambiguous.

## 4. Minimal plan
The smallest change that meets the criteria: files to touch, existing components and hooks to
reuse, and whether a migration is needed. No new dependency unless nothing existing works.

## 5. Branch
`git switch -c <short-name>` from an up-to-date `main`. Never work on `main`.

## 6. Implement with tests
- App logic: a Jest test next to the file (`*.test.ts(x)`).
- Database: a migration plus a `tests/db/*.test.ts` case. Then run `/cheffy-db-audit`.
- UI: run `/cheffy-ui-review` when screens change.

## 7. Automated checks
`npm run check` (≈2 min). All of it must pass. Fix causes, never suppress.

## 8. Independent review (substantial changes only)
Send the diff (`git diff main...HEAD`) to the reviewers that apply, in one parallel batch:
- `cheffy-quality-reviewer`: always, for logic changes.
- `cheffy-security-reviewer`: any SQL, RPC, RLS, storage, auth, Edge Function or privacy change.
- `cheffy-ui-reviewer`: any screen or component change.
Skip the reviewers for trivial diffs. Then check each finding against the code yourself.
Reviewers can be wrong.

## 9–10. Fix and re-verify
Fix confirmed findings, then re-run `npm run check` (and `npm run test:db` for SQL).

## 11. Summarize
Update PROGRESS.md: what changed, files, tests, how it was verified, what wasn't verified,
remaining risks. Report the same briefly to the user.

## Done when
All criteria are met, `npm run check` passes, confirmed review findings are fixed, and
PROGRESS.md is updated. Nothing is pushed to production, committed or merged unless the user
asked.
