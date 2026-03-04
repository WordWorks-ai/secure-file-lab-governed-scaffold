#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

assert_contains() {
  local file="$1"
  local expected="$2"
  if ! grep -Fq "$expected" "$file"; then
    echo "scope accuracy check failed: missing expected text in $file" >&2
    echo "expected: $expected" >&2
    exit 1
  fi
}

assert_contains "$ROOT_DIR/README.md" "This repository currently implements a **Phase 0/7 foundation + file + share + audit + backup/restore operations baseline**, not a complete secure file sharing prototype."
assert_contains "$ROOT_DIR/README.md" "Not implemented yet:"
assert_contains "$ROOT_DIR/docs/security-baseline.md" "auth, file malware-gate, share policy, audit query/export, and backup/restore operational baselines are implemented; final CI/handoff polish remains in later phases."
assert_contains "$ROOT_DIR/docs/threat-model.md" "Current codebase is Phase 0/7 with share-policy, audit-query/export, and operational backup/restore baseline implemented; CI/handoff polish remains in later phases."
assert_contains "$ROOT_DIR/docs/data-model.md" 'core schema baseline is implemented for `users`, `orgs`, `memberships`, `files`, `shares`, `refresh_tokens`, `bootstrap_state`, and `audit_events`.'

echo "scope accuracy checks passed"
