#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RESTORE_SCRIPT="$ROOT_DIR/infra/scripts/restore-smoke.sh"

if [[ ! -x "$RESTORE_SCRIPT" ]]; then
  echo "restore script missing or not executable: $RESTORE_SCRIPT" >&2
  exit 1
fi

tmp_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root"' EXIT

assert_fails_with() {
  local expected_message="$1"
  shift

  set +e
  output="$("$@" 2>&1)"
  exit_code=$?
  set -e

  if [[ $exit_code -eq 0 ]]; then
    echo "expected command to fail but it succeeded: $*" >&2
    exit 1
  fi

  if ! grep -Fq "$expected_message" <<<"$output"; then
    echo "expected failure message not found: $expected_message" >&2
    echo "actual output:" >&2
    echo "$output" >&2
    exit 1
  fi
}

# 1) no backups directory contents
assert_fails_with "no backups found" env BACKUP_ROOT="$tmp_root" "$RESTORE_SCRIPT"

# 2) missing postgres.sql
case_missing_postgres="$tmp_root/20260303-010101"
mkdir -p "$case_missing_postgres/minio"
echo '{}' > "$case_missing_postgres/manifest.json"
assert_fails_with "backup is missing postgres.sql" env BACKUP_ROOT="$tmp_root" "$RESTORE_SCRIPT"

# 3) missing manifest.json
case_missing_manifest="$tmp_root/20260303-010102"
mkdir -p "$case_missing_manifest/minio"
echo '-- sql placeholder' > "$case_missing_manifest/postgres.sql"
assert_fails_with "backup is missing manifest.json" env BACKUP_ROOT="$tmp_root" "$RESTORE_SCRIPT"

# 4) missing minio directory
case_missing_minio="$tmp_root/20260303-010103"
mkdir -p "$case_missing_minio"
echo '-- sql placeholder' > "$case_missing_minio/postgres.sql"
echo '{}' > "$case_missing_minio/manifest.json"
assert_fails_with "backup is missing minio directory" env BACKUP_ROOT="$tmp_root" "$RESTORE_SCRIPT"

echo "backup/restore guard checks passed"
