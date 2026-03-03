#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups}"
LATEST_DIR="$(ls -1dt "$BACKUP_ROOT"/* 2>/dev/null | head -n 1 || true)"
SMOKE_DB_CONTAINER="restore-smoke-postgres"
SMOKE_DB_USER="${SMOKE_DB_USER:-sfl}"
SMOKE_DB_NAME="${SMOKE_DB_NAME:-sfl}"
SMOKE_DB_PASSWORD="${SMOKE_DB_PASSWORD:-sfl}"
SMOKE_DB_WAIT_SECONDS="${SMOKE_DB_WAIT_SECONDS:-60}"
SMOKE_MINIO_CONTAINER="restore-smoke-minio"
SMOKE_MINIO_IMAGE="${SMOKE_MINIO_IMAGE:-quay.io/minio/minio:RELEASE.2025-02-07T23-21-09Z}"
SMOKE_MC_IMAGE="${SMOKE_MC_IMAGE:-minio/mc:RELEASE.2025-02-08T19-14-21Z}"
SMOKE_MINIO_WAIT_SECONDS="${SMOKE_MINIO_WAIT_SECONDS:-60}"
SMOKE_MINIO_ROOT_USER="${SMOKE_MINIO_ROOT_USER:-minioadmin}"
SMOKE_MINIO_ROOT_PASSWORD="${SMOKE_MINIO_ROOT_PASSWORD:-minioadmin}"
SMOKE_MINIO_BUCKET="${SMOKE_MINIO_BUCKET:-secure-files}"
ENV_LIB="$ROOT_DIR/infra/scripts/lib/env.sh"

if [[ -f "$ROOT_DIR/.env" ]]; then
  source "$ENV_LIB"
  load_env_file "$ROOT_DIR/.env"
  SMOKE_DB_USER="${POSTGRES_USER:-$SMOKE_DB_USER}"
  SMOKE_DB_NAME="${POSTGRES_DB:-$SMOKE_DB_NAME}"
  SMOKE_MINIO_ROOT_USER="${MINIO_ROOT_USER:-$SMOKE_MINIO_ROOT_USER}"
  SMOKE_MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-$SMOKE_MINIO_ROOT_PASSWORD}"
  SMOKE_MINIO_BUCKET="${MINIO_BUCKET:-$SMOKE_MINIO_BUCKET}"
fi

if [[ -z "$LATEST_DIR" ]]; then
  echo "no backups found in $BACKUP_ROOT" >&2
  exit 1
fi

if [[ ! -f "$LATEST_DIR/postgres.sql" ]]; then
  echo "backup is missing postgres.sql in $LATEST_DIR" >&2
  exit 1
fi

if [[ ! -f "$LATEST_DIR/manifest.json" ]]; then
  echo "backup is missing manifest.json in $LATEST_DIR" >&2
  exit 1
fi

if [[ ! -d "$LATEST_DIR/minio" ]]; then
  echo "backup is missing minio directory in $LATEST_DIR" >&2
  exit 1
fi

wait_for_minio() {
  local timeout_seconds="$1"
  local i
  for ((i = 1; i <= timeout_seconds; i++)); do
    if docker run --rm \
      --network "container:$SMOKE_MINIO_CONTAINER" \
      --entrypoint /bin/sh \
      "$SMOKE_MC_IMAGE" \
      -c "mc alias set local http://127.0.0.1:9000 \"$SMOKE_MINIO_ROOT_USER\" \"$SMOKE_MINIO_ROOT_PASSWORD\" >/dev/null 2>&1 && mc ls local >/dev/null 2>&1"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

trap 'docker rm -f "$SMOKE_DB_CONTAINER" "$SMOKE_MINIO_CONTAINER" >/dev/null 2>&1 || true' EXIT

docker rm -f "$SMOKE_DB_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$SMOKE_DB_CONTAINER" \
  -e POSTGRES_USER="$SMOKE_DB_USER" \
  -e POSTGRES_PASSWORD="$SMOKE_DB_PASSWORD" \
  -e POSTGRES_DB="$SMOKE_DB_NAME" \
  postgres:16-alpine >/dev/null

for ((i = 1; i <= SMOKE_DB_WAIT_SECONDS; i++)); do
  if docker exec "$SMOKE_DB_CONTAINER" pg_isready -U "$SMOKE_DB_USER" -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "$SMOKE_DB_CONTAINER" pg_isready -U "$SMOKE_DB_USER" -d postgres >/dev/null 2>&1; then
  echo "restore smoke failed: temporary postgres did not become ready within ${SMOKE_DB_WAIT_SECONDS}s" >&2
  docker logs "$SMOKE_DB_CONTAINER" >&2 || true
  exit 1
fi

# Ensure requested restore database exists even if entrypoint init order lags.
db_exists="$(
  docker exec "$SMOKE_DB_CONTAINER" psql \
    -U "$SMOKE_DB_USER" \
    -d postgres \
    -v ON_ERROR_STOP=1 \
    -v smoke_db_name="$SMOKE_DB_NAME" \
    -tA <<'SQL'
SELECT 1 FROM pg_database WHERE datname = :'smoke_db_name';
SQL
)"

if [[ "$(tr -d '[:space:]' <<<"$db_exists")" != "1" ]]; then
  docker exec "$SMOKE_DB_CONTAINER" psql \
    -U "$SMOKE_DB_USER" \
    -d postgres \
    -v ON_ERROR_STOP=1 \
    -v smoke_db_name="$SMOKE_DB_NAME" \
    -v smoke_db_user="$SMOKE_DB_USER" \
    >/dev/null <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'smoke_db_name', :'smoke_db_user')
\gexec
SQL
fi

cat "$LATEST_DIR/postgres.sql" | docker exec -i "$SMOKE_DB_CONTAINER" \
  psql -v ON_ERROR_STOP=1 -U "$SMOKE_DB_USER" -d "$SMOKE_DB_NAME" >/dev/null

docker exec "$SMOKE_DB_CONTAINER" psql -U "$SMOKE_DB_USER" -d "$SMOKE_DB_NAME" -tAc 'SELECT 1' >/dev/null

if [[ -f "$LATEST_DIR/SHA256SUMS" ]]; then
  (
    cd "$LATEST_DIR"
    shasum -a 256 -c SHA256SUMS >/dev/null
  )
fi

docker rm -f "$SMOKE_MINIO_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$SMOKE_MINIO_CONTAINER" \
  -e MINIO_ROOT_USER="$SMOKE_MINIO_ROOT_USER" \
  -e MINIO_ROOT_PASSWORD="$SMOKE_MINIO_ROOT_PASSWORD" \
  "$SMOKE_MINIO_IMAGE" server /data --console-address ':9001' >/dev/null

if ! wait_for_minio "$SMOKE_MINIO_WAIT_SECONDS"; then
  echo "restore smoke failed: temporary minio did not become ready within ${SMOKE_MINIO_WAIT_SECONDS}s" >&2
  docker logs "$SMOKE_MINIO_CONTAINER" >&2 || true
  exit 1
fi

docker run --rm \
  --network "container:$SMOKE_MINIO_CONTAINER" \
  -v "$LATEST_DIR/minio:/restore:ro" \
  --entrypoint /bin/sh \
  "$SMOKE_MC_IMAGE" \
  -c "mc alias set local http://127.0.0.1:9000 \"$SMOKE_MINIO_ROOT_USER\" \"$SMOKE_MINIO_ROOT_PASSWORD\" && mc mb --ignore-existing local/\"$SMOKE_MINIO_BUCKET\" && mc mirror /restore local/\"$SMOKE_MINIO_BUCKET\""

backup_object_count="$(find "$LATEST_DIR/minio" -type f | wc -l | tr -d '[:space:]')"
restored_object_count="$(
  docker run --rm \
    --network "container:$SMOKE_MINIO_CONTAINER" \
    --entrypoint /bin/sh \
    "$SMOKE_MC_IMAGE" \
    -c "set -e; mc alias set local http://127.0.0.1:9000 \"$SMOKE_MINIO_ROOT_USER\" \"$SMOKE_MINIO_ROOT_PASSWORD\" >/dev/null; mc ls --recursive local/\"$SMOKE_MINIO_BUCKET\" | wc -l" \
    | tr -d '[:space:]'
)"

if [[ "$restored_object_count" != "$backup_object_count" ]]; then
  echo "restore smoke failed: minio object count mismatch (expected $backup_object_count, got $restored_object_count)" >&2
  exit 1
fi

docker run --rm \
  --network "container:$SMOKE_MINIO_CONTAINER" \
  --entrypoint /bin/sh \
  "$SMOKE_MC_IMAGE" \
  -c "mc alias set local http://127.0.0.1:9000 \"$SMOKE_MINIO_ROOT_USER\" \"$SMOKE_MINIO_ROOT_PASSWORD\" >/dev/null && mc ls local/\"$SMOKE_MINIO_BUCKET\" >/dev/null"

echo "restore smoke passed for backup at $LATEST_DIR (postgres + minio)"
