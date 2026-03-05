#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/infra/scripts/demo-session.sh"

assert_contains() {
  local text="$1"
  local expected="$2"
  if ! printf '%s' "$text" | grep -Fq -- "$expected"; then
    echo "demo session interface check failed: missing expected text" >&2
    echo "expected: $expected" >&2
    exit 1
  fi
}

if [[ ! -x "$SCRIPT_PATH" ]]; then
  echo "demo session script is missing or not executable: $SCRIPT_PATH" >&2
  exit 1
fi

help_output="$("$SCRIPT_PATH" --help)"
assert_contains "$help_output" "--mode"
assert_contains "$help_output" "exec = platform + health + API storyline"
assert_contains "$help_output" "tech = exec + scaffold/hardening checks"
assert_contains "$help_output" "full = tech + backup/restore smoke flow"
assert_contains "$help_output" "--report-dir"

script_contents="$(cat "$SCRIPT_PATH")"
assert_contains "$script_contents" "run_stage"
assert_contains "$script_contents" "write_reports"
assert_contains "$script_contents" "latest.json"
assert_contains "$script_contents" "latest.md"
assert_contains "$script_contents" "Timing scorecard"

echo "demo session interface checks passed"
