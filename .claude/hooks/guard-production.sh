#!/usr/bin/env bash
# PreToolUse (Bash): commands that change production, cost money or publish
# always ask the owner first, even in auto mode. Everything else passes.
set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

reason=""
has() { grep -Eq -- "$1" <<<"$cmd"; }

if has 'supabase[^|;&]*db push' && ! has 'db push[^|;&]*--dry-run'; then
  reason="pushes migrations to the live Supabase database"
elif has 'supabase[^|;&]*db query[^|;&]*(--linked|--remote)' && ! has 'db query[^|;&]*--read-only'; then
  reason="runs a query that can write to the live database (no --read-only)"
elif has 'supabase[^|;&]*(db reset|migration repair|config push|secrets (set|unset)|functions deploy|functions delete|storage rm)'; then
  reason="changes the live Supabase project"
elif has 'eas(-cli(@[^ ]*)?)?[[:space:]]+(build|submit|update|deploy|channel:edit|env:(create|update|delete))([[:space:]]|$)'; then
  reason="starts an EAS build, upload, OTA update or deploy"
elif has 'gh[[:space:]]+pr[[:space:]]+merge|gh[[:space:]]+release[[:space:]]+create'; then
  reason="merges a pull request or publishes a release"
elif has 'git[[:space:]]+push[^|;&]*([[:space:]]|:)(main|master)([[:space:]]|$)' || has 'git[[:space:]]+push[^|;&]*(--force|-f([[:space:]]|$))'; then
  reason="pushes to main or force-pushes"
fi

[ -z "$reason" ] && exit 0

jq -n --arg r "Cheffy guard: this command $reason. It needs the owner's explicit OK." '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: $r
  }
}'
