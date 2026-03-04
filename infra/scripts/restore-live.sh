#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/docker-compose.yml}"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups}"
BACKUP_DIR="${BACKUP_DIR:-}"
RESTORE_CONFIRM="${RESTORE_CONFIRM:-}"
RESTORE_STOP_APP_SERVICES="${RESTORE_STOP_APP_SERVICES:-true}"
WAIT_SCRIPT="$ROOT_DIR/infra/scripts/lib/wait-for-health.sh"
ENV_LIB="$ROOT_DIR/infra/scripts/lib/env.sh"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo ".env not found" >&2
  exit 1
fi

source "$ENV_LIB"
load_env_file "$ROOT_DIR/.env"

required_vars=(
  POSTGRES_USER
  POSTGRES_DB
  MINIO_ROOT_USER
  MINIO_ROOT_PASSWORD
  MINIO_BUCKET
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "required environment variable is missing: ${var_name}" >&2
    exit 1
  fi
done

if [[ "$RESTORE_CONFIRM" != "YES" ]]; then
  echo "refusing destructive live restore without RESTORE_CONFIRM=YES" >&2
  exit 1
fi

mkdir -p "$BACKUP_ROOT"
backup_root_real="$(cd "$BACKUP_ROOT" && pwd)"

if [[ "$backup_root_real" == "/" ]]; then
  echo "BACKUP_ROOT must not resolve to /" >&2
  exit 1
fi

if [[ -n "$BACKUP_DIR" ]]; then
  if [[ "$BACKUP_DIR" == /* ]]; then
    target_dir="$BACKUP_DIR"
  else
    target_dir="$BACKUP_ROOT/$BACKUP_DIR"
  fi
else
  target_dir="$(ls -1dt "$BACKUP_ROOT"/* 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$target_dir" || ! -d "$target_dir" ]]; then
  echo "no backups found in $BACKUP_ROOT" >&2
  exit 1
fi

target_dir_real="$(cd "$target_dir" && pwd)"
case "$target_dir_real" in
  "$backup_root_real"/*) ;;
  *)
    echo "BACKUP_DIR must remain within BACKUP_ROOT" >&2
    exit 1
    ;;
esac

if [[ ! -f "$target_dir_real/postgres.sql" ]]; then
  echo "backup is missing postgres.sql in $target_dir_real" >&2
  exit 1
fi

if [[ ! -f "$target_dir_real/manifest.json" ]]; then
  echo "backup is missing manifest.json in $target_dir_real" >&2
  exit 1
fi

if [[ ! -d "$target_dir_real/minio" ]]; then
  echo "backup is missing minio directory in $target_dir_real" >&2
  exit 1
fi

if [[ -f "$target_dir_real/SHA256SUMS" ]]; then
  (
    cd "$target_dir_real"
    shasum -a 256 -c SHA256SUMS >/dev/null
  )
fi

postgres_container_id="$(docker compose -f "$COMPOSE_FILE" ps -q postgres)"
minio_container_id="$(docker compose -f "$COMPOSE_FILE" ps -q minio)"

if [[ -z "$postgres_container_id" || -z "$minio_container_id" ]]; then
  echo "postgres and minio services must be running before live restore" >&2
  exit 1
fi

stopped_app_services=0
restart_app_services() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" start api worker >/dev/null
  if [[ -x "$WAIT_SCRIPT" ]]; then
    "$WAIT_SCRIPT" "$COMPOSE_FILE" worker 240
    "$WAIT_SCRIPT" "$COMPOSE_FILE" api 240
  fi
  stopped_app_services=0
}

cleanup() {
  local exit_code="$1"

  if [[ "$stopped_app_services" -eq 1 ]]; then
    restart_app_services >/dev/null 2>&1 || true
  fi

  exit "$exit_code"
}

trap 'cleanup $?' EXIT

if [[ "$RESTORE_STOP_APP_SERVICES" == "true" ]]; then
  docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" stop api worker >/dev/null
  stopped_app_services=1
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -v restore_db="$POSTGRES_DB" <<'SQL' >/dev/null
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'restore_db'
  AND pid <> pg_backend_pid();
SQL

docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL' >/dev/null
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO CURRENT_USER;
SQL

cat "$target_dir_real/postgres.sql" | docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null

docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc 'SELECT 1' >/dev/null

docker run --rm \
  --network "container:$minio_container_id" \
  -v "$target_dir_real/minio:/restore:ro" \
  --entrypoint /bin/sh \
  minio/mc:RELEASE.2025-02-08T19-14-21Z \
  -c "set -e; \
      mc alias set local http://127.0.0.1:9000 \"$MINIO_ROOT_USER\" \"$MINIO_ROOT_PASSWORD\" >/dev/null; \
      mc mb --ignore-existing local/\"$MINIO_BUCKET\" >/dev/null; \
      mc rm --recursive --force local/\"$MINIO_BUCKET\" >/dev/null 2>&1 || true; \
      mc mb --ignore-existing local/\"$MINIO_BUCKET\" >/dev/null; \
      mc mirror /restore local/\"$MINIO_BUCKET\" --overwrite >/dev/null"

expected_object_count="$(find "$target_dir_real/minio" -type f | wc -l | tr -d '[:space:]')"
restored_object_count="$(
  docker run --rm \
    --network "container:$minio_container_id" \
    --entrypoint /bin/sh \
    minio/mc:RELEASE.2025-02-08T19-14-21Z \
    -c "set -e; mc alias set local http://127.0.0.1:9000 \"$MINIO_ROOT_USER\" \"$MINIO_ROOT_PASSWORD\" >/dev/null; mc ls --recursive local/\"$MINIO_BUCKET\" | wc -l" \
    | tr -d '[:space:]'
)"

if [[ "$restored_object_count" != "$expected_object_count" ]]; then
  echo "live restore failed: minio object count mismatch (expected $expected_object_count, got $restored_object_count)" >&2
  exit 1
fi

if [[ "$stopped_app_services" -eq 1 ]]; then
  restart_app_services
fi

if [[ -x "$ROOT_DIR/infra/scripts/health.sh" ]]; then
  health_ok=0
  for ((attempt = 1; attempt <= 10; attempt++)); do
    if COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/infra/scripts/health.sh" >/dev/null 2>&1; then
      health_ok=1
      break
    fi
    sleep 2
  done

  if [[ "$health_ok" -ne 1 ]]; then
    echo "live restore failed: post-restore health check did not become ready" >&2
    exit 1
  fi
fi

echo "live restore completed from $target_dir_real"
