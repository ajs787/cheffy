#!/usr/bin/env bash
# Stop: if TypeScript files changed (vs HEAD), run typecheck + lint on them
# before Claude finishes. Skips when nothing changed since the last clean
# run, so long conversations don't pay for it on every turn. Failures are
# sent back to Claude (exit 2) to fix, never silently ignored.
set -uo pipefail

input=$(cat)
# Already continuing because of this hook: don't loop.
[ "$(jq -r '.stop_hook_active // false' <<<"$input")" = "true" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
export PATH="$HOME/.local/node24/bin:$PATH"

files=$( { git diff --name-only HEAD -- src tests 2>/dev/null
           git ls-files --others --exclude-standard -- src tests; } \
         | grep -E '\.(ts|tsx)$' | sort -u | while read -r f; do [ -f "$f" ] && echo "$f"; done )
[ -z "$files" ] && exit 0

stamp="$(git rev-parse --git-dir)/claude-ts-check"
hash=$( { echo "$files"; xargs cat <<<"$files"; } | shasum | cut -d' ' -f1 )
[ -f "$stamp" ] && [ "$(cat "$stamp")" = "$hash" ] && exit 0

out=$(npx tsc --noEmit 2>&1); tsc_ok=$?
lint=$(xargs npx eslint --max-warnings 0 <<<"$files" 2>&1); lint_ok=$?

if [ $tsc_ok -eq 0 ] && [ $lint_ok -eq 0 ]; then
  echo "$hash" > "$stamp"
  exit 0
fi

{
  echo "Cheffy check failed on changed files. Fix the cause (don't suppress it):"
  [ $tsc_ok -ne 0 ] && { echo "--- typecheck"; echo "$out" | head -40; }
  [ $lint_ok -ne 0 ] && { echo "--- lint"; echo "$lint" | head -40; }
} >&2
exit 2
