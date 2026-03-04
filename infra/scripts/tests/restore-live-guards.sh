#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RESTORE_LIVE_SCRIPT="$ROOT_DIR/infra/scripts/restore-live.sh"

if [[ ! -x "$RESTORE_LIVE_SCRIPT" ]]; then
  echo "restore-live script missing or not executable: $RESTORE_LIVE_SCRIPT" >&2
  exit 1
fi

tmp_root="$(mktemp -d)"
outside_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root" "$outside_root"' EXIT

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

# 1) destructive confirmation is mandatory
assert_fails_with "refusing destructive live restore without RESTORE_CONFIRM=YES" env BACKUP_ROOT="$tmp_root" "$RESTORE_LIVE_SCRIPT"

# 2) backup root must not resolve to /
assert_fails_with "BACKUP_ROOT must not resolve to /" env RESTORE_CONFIRM=YES BACKUP_ROOT="/" "$RESTORE_LIVE_SCRIPT"

# 3) absolute BACKUP_DIR must remain inside BACKUP_ROOT
mkdir -p "$outside_root/minio"
echo '-- sql placeholder' > "$outside_root/postgres.sql"
echo '{}' > "$outside_root/manifest.json"
assert_fails_with "BACKUP_DIR must remain within BACKUP_ROOT" env RESTORE_CONFIRM=YES BACKUP_ROOT="$tmp_root" BACKUP_DIR="$outside_root" "$RESTORE_LIVE_SCRIPT"

# 4) required artifact checks run before docker calls
missing_postgres="$tmp_root/20260304-010101"
mkdir -p "$missing_postgres/minio"
echo '{}' > "$missing_postgres/manifest.json"
assert_fails_with "backup is missing postgres.sql" env RESTORE_CONFIRM=YES BACKUP_ROOT="$tmp_root" BACKUP_DIR="$(basename "$missing_postgres")" "$RESTORE_LIVE_SCRIPT"

missing_manifest="$tmp_root/20260304-010102"
mkdir -p "$missing_manifest/minio"
echo '-- sql placeholder' > "$missing_manifest/postgres.sql"
assert_fails_with "backup is missing manifest.json" env RESTORE_CONFIRM=YES BACKUP_ROOT="$tmp_root" BACKUP_DIR="$(basename "$missing_manifest")" "$RESTORE_LIVE_SCRIPT"

missing_minio="$tmp_root/20260304-010103"
mkdir -p "$missing_minio"
echo '-- sql placeholder' > "$missing_minio/postgres.sql"
echo '{}' > "$missing_minio/manifest.json"
assert_fails_with "backup is missing minio directory" env RESTORE_CONFIRM=YES BACKUP_ROOT="$tmp_root" BACKUP_DIR="$(basename "$missing_minio")" "$RESTORE_LIVE_SCRIPT"

echo "restore-live guard checks passed"
