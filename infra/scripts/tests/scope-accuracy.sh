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

assert_contains "$ROOT_DIR/README.md" "This repository currently implements a **Phase 0/5 foundation + file ingest/encryption + worker malware-gate baseline**, not a complete secure file sharing prototype."
assert_contains "$ROOT_DIR/README.md" "Not implemented yet:"
assert_contains "$ROOT_DIR/docs/security-baseline.md" "core auth + file malware-gate controls are implemented, while share and full audit-query controls remain incomplete."
assert_contains "$ROOT_DIR/docs/threat-model.md" "Current codebase is Phase 0/5 with malware-gate runtime implemented; share-policy and audit-query paths remain partially scaffolded."
assert_contains "$ROOT_DIR/docs/data-model.md" 'core schema baseline is implemented for `users`, `orgs`, `memberships`, `files`, `shares`, `refresh_tokens`, `bootstrap_state`, and `audit_events`.'

echo "scope accuracy checks passed"
