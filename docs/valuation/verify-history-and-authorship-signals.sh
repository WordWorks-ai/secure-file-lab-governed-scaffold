#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: run this from inside the target git repository."
  exit 1
fi

say() {
  printf '%s\n' "$*"
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

say "History and authorship signal review"
say "Repository: $repo_root"
say

total_commits="$(git rev-list --count --all)"
unique_days="$(git log --format=%aI --all | cut -dT -f1 | sort -u | wc -l | tr -d ' ')"
first_iso="$(git log --reverse --format=%aI --all -n 1)"
last_iso="$(git log --format=%aI --all -n 1)"

say "Total commits: $total_commits"
say "Unique commit days: $unique_days"
say "First commit: $first_iso"
say "Last commit:  $last_iso"

if have_cmd python3; then
  python3 - <<'PY' "$first_iso" "$last_iso"
from datetime import datetime
import sys
first = datetime.fromisoformat(sys.argv[1].replace('Z', '+00:00'))
last = datetime.fromisoformat(sys.argv[2].replace('Z', '+00:00'))
span = last - first
print(f"Wall-clock span across repository history: {span}")
PY
fi

say
if [ "$unique_days" = "1" ]; then
  say "OBSERVATION: all commits land on a single calendar day."
else
  say "OBSERVATION: commits span multiple calendar days."
fi

say
initial_commit="$(git rev-list --max-parents=0 HEAD | tail -1)"
initial_subject="$(git show -s --format=%s "$initial_commit")"
initial_files="$(git show --numstat --format='' "$initial_commit" | wc -l | tr -d ' ')"
initial_added="$(git show --numstat --format='' "$initial_commit" | awk '{sum += $1} END {print sum + 0}')"

say "Initial commit: $initial_commit"
say "Initial subject: $initial_subject"
say "Initial commit file count: $initial_files"
say "Initial commit added lines: $initial_added"

say
codex_refs="$(git log --all --decorate=full --oneline | grep -i 'codex/' || true)"
if [ -n "$codex_refs" ]; then
  say "Found codex-style refs in history:"
  printf '%s\n' "$codex_refs"
else
  say "No codex-style refs found in decorated history output."
fi

say
cursor_local="no"
if [ -d .git/cursor ]; then
  cursor_local="yes"
fi
say "Local .git/cursor metadata present: $cursor_local"
if [ "$cursor_local" = "yes" ]; then
  say "NOTE: .git/cursor is local git metadata, not versioned repository content."
fi

say
pricing_hits="$(grep -RInE --exclude='verify-history-and-authorship-signals.sh' '340[[:space:]]*(to|-)[[:space:]]*560|6[[:space:]]*(to|-)[[:space:]]*16[[:space:]]*weeks|\$75K|\$120K|\$90K' docs 2>/dev/null || true)"
if [ -n "$pricing_hits" ]; then
  say "Found pricing/hour-estimate anchors in docs/:"
  printf '%s\n' "$pricing_hits"
else
  say "No matching pricing/hour-estimate anchors found in docs/."
fi

say
if [ -f docs/valuation/INDEPENDENT_VALUATION_REPORT.md ]; then
  say "Artifact-only valuation report present: docs/valuation/INDEPENDENT_VALUATION_REPORT.md"
else
  say "Artifact-only valuation report not found at docs/valuation/INDEPENDENT_VALUATION_REPORT.md"
fi

if [ -f docs/valuation/CONVERSATION_REVIEW_AND_FORWARD_POSITION.md ]; then
  say "Conversation review memo present: docs/valuation/CONVERSATION_REVIEW_AND_FORWARD_POSITION.md"
else
  say "Conversation review memo not found."
fi

if [ -f docs/valuation/AUTHORSHIP_MODEL_COMMERCIAL_POSITION.md ]; then
  say "Authorship commercial memo present: docs/valuation/AUTHORSHIP_MODEL_COMMERCIAL_POSITION.md"
else
  say "Authorship commercial memo not found."
fi

say
say "Interpretation guide"
say "- Use artifact-only valuation for snapshot transfer discussions."
say "- Use authorship and urgency framing when the buyer wants speed, judgment, or ongoing involvement."
say "- Do not treat rapid AI-assisted authorship as evidence that the work is unreal or valueless."
