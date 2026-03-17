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

assert_contains "$ROOT_DIR/README.md" "This repository currently implements a governed secure-file-sharing prototype baseline with working auth, MFA, encrypted file ingest, malware-gated activation, share-link controls, audit analytics/export, and local backup/restore operations."
assert_contains "$ROOT_DIR/README.md" "Not implemented as production-depth defaults (intentionally deferred):"
assert_contains "$ROOT_DIR/docs/security-baseline.md" "MFA, encrypted file ingest, malware-gated activation, share policy, audit"
assert_contains "$ROOT_DIR/docs/threat-model.md" "Current codebase includes working"
assert_contains "$ROOT_DIR/docs/data-model.md" 'core schema baseline is implemented for `users`, `orgs`, `memberships`, `files`, `shares`, `refresh_tokens`, `bootstrap_state`, and `audit_events`.'

echo "scope accuracy checks passed"
