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

assert_contains "$ROOT_DIR/README.md" "This repository currently implements a **Phase 0/8 governed prototype baseline** with runtime flows, operational backup/restore readiness, and CI/handoff quality gates."
assert_contains "$ROOT_DIR/README.md" "Not implemented in v1 (intentionally out of scope):"
assert_contains "$ROOT_DIR/docs/security-baseline.md" "auth, file malware-gate, share policy, audit query/export, backup/restore operational baselines, and CI security gates are implemented."
assert_contains "$ROOT_DIR/docs/threat-model.md" "Current codebase is Phase 0/8 with share-policy, audit-query/export, operational backup/restore baseline, and CI quality-gate baseline implemented."
assert_contains "$ROOT_DIR/docs/data-model.md" 'core schema baseline is implemented for `users`, `orgs`, `memberships`, `files`, `shares`, `refresh_tokens`, `bootstrap_state`, and `audit_events`.'

echo "scope accuracy checks passed"
