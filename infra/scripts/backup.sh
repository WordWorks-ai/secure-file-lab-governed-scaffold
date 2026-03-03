#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/docker-compose.yml}"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups}"
RETENTION_COUNT="${RETENTION_COUNT:-7}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$BACKUP_ROOT/$TIMESTAMP"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo ".env not found" >&2
  exit 1
fi

set -a
source "$ROOT_DIR/.env"
set +a

required_vars=(
  POSTGRES_USER
  POSTGRES_DB
  MINIO_ENDPOINT
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

mkdir -p "$OUT_DIR"
mkdir -p "$OUT_DIR/minio"

backup_root_real="$(cd "$BACKUP_ROOT" && pwd)"
out_dir_real="$(cd "$OUT_DIR" && pwd)"

if [[ "$backup_root_real" == "/" ]]; then
  echo "BACKUP_ROOT must not resolve to /" >&2
  exit 1
fi

case "$out_dir_real" in
  "$backup_root_real"/*) ;;
  *)
    echo "OUT_DIR must remain within BACKUP_ROOT" >&2
    exit 1
    ;;
esac

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$OUT_DIR/postgres.sql"

minio_container_id="$(docker compose -f "$COMPOSE_FILE" ps -q minio)"
if [[ -z "$minio_container_id" ]]; then
  echo "could not find running minio container" >&2
  exit 1
fi

compose_network="$(
  docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$minio_container_id" \
    | head -n 1 \
    | tr -d '[:space:]'
)"

if [[ -z "$compose_network" ]]; then
  echo "could not determine compose network for minio container" >&2
  exit 1
fi

docker run --rm \
  --network "$compose_network" \
  -v "$OUT_DIR:/backup" \
  --entrypoint /bin/sh \
  minio/mc:RELEASE.2025-02-08T19-14-21Z \
  -c "mc alias set local ${MINIO_ENDPOINT} ${MINIO_ROOT_USER} ${MINIO_ROOT_PASSWORD} && mc mirror local/${MINIO_BUCKET} /backup/minio"

checksum_file="$OUT_DIR/SHA256SUMS"
(
  cd "$OUT_DIR"
  shasum -a 256 postgres.sql > "$checksum_file"
  if [[ -d minio ]]; then
    find minio -type f -print0 | sort -z | xargs -0 shasum -a 256 >> "$checksum_file" || true
  fi
)

cat > "$OUT_DIR/manifest.json" <<MANIFEST
{
  "timestamp": "$TIMESTAMP",
  "postgres": "postgres.sql",
  "minio": "minio",
  "checksums": "SHA256SUMS",
  "retention_count": ${RETENTION_COUNT},
  "note": "Vault backup/recovery remains documented-only for prototype phase"
}
MANIFEST

if [[ "$RETENTION_COUNT" =~ ^[0-9]+$ ]] && (( RETENTION_COUNT >= 1 )); then
  backup_dirs=()
  while IFS= read -r backup_dir; do
    backup_dirs+=("$backup_dir")
  done < <(find "$backup_root_real" -mindepth 1 -maxdepth 1 -type d | sort -r)
  if (( ${#backup_dirs[@]} > RETENTION_COUNT )); then
    for old_backup in "${backup_dirs[@]:RETENTION_COUNT}"; do
      rm -rf "$old_backup"
    done
  fi
fi

echo "backup written to $OUT_DIR"
