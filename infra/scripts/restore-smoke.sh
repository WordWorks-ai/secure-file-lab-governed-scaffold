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

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
  SMOKE_DB_USER="${POSTGRES_USER:-$SMOKE_DB_USER}"
  SMOKE_DB_NAME="${POSTGRES_DB:-$SMOKE_DB_NAME}"
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

trap 'docker rm -f "$SMOKE_DB_CONTAINER" >/dev/null 2>&1 || true' EXIT

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
if ! docker exec "$SMOKE_DB_CONTAINER" psql -U "$SMOKE_DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$SMOKE_DB_NAME'" | grep -q '^1$'; then
  docker exec "$SMOKE_DB_CONTAINER" psql -U "$SMOKE_DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$SMOKE_DB_NAME\" OWNER \"$SMOKE_DB_USER\";" >/dev/null
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

echo "restore smoke passed for backup at $LATEST_DIR"
