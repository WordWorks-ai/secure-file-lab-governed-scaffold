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

assert_contains "$ROOT_DIR/README.md" "This repository currently implements a **Phase 0/1 scaffold**, not a complete secure file sharing prototype."
assert_contains "$ROOT_DIR/README.md" "Not implemented yet:"
assert_contains "$ROOT_DIR/docs/security-baseline.md" "many controls are still scaffolded and not yet enforced in end-to-end API flows."
assert_contains "$ROOT_DIR/docs/threat-model.md" "Current codebase is still scaffold-heavy (Phase 0/1); several listed mitigations are not yet implemented in runtime application flows."
assert_contains "$ROOT_DIR/docs/data-model.md" 'Current implemented schema is a scaffold subset: `users`, `bootstrap_state`, and `audit_events`.'

echo "scope accuracy checks passed"
