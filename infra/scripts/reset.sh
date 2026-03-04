#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/docker-compose.yml}"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups}"
RESET_CONFIRM="${RESET_CONFIRM:-}"
RESET_BACKUP_FIRST="${RESET_BACKUP_FIRST:-true}"
RESET_DELETE_BACKUPS="${RESET_DELETE_BACKUPS:-false}"
RESET_START_STACK="${RESET_START_STACK:-false}"
RESET_BOOTSTRAP_AFTER_START="${RESET_BOOTSTRAP_AFTER_START:-false}"
ENV_LIB="$ROOT_DIR/infra/scripts/lib/env.sh"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo ".env not found" >&2
  exit 1
fi

source "$ENV_LIB"
load_env_file "$ROOT_DIR/.env"

if [[ "$RESET_CONFIRM" != "YES" ]]; then
  echo "refusing destructive reset without RESET_CONFIRM=YES" >&2
  exit 1
fi

if [[ "$RESET_BOOTSTRAP_AFTER_START" == "true" && "$RESET_START_STACK" != "true" ]]; then
  echo "RESET_BOOTSTRAP_AFTER_START=true requires RESET_START_STACK=true" >&2
  exit 1
fi

if [[ "$RESET_BACKUP_FIRST" == "true" ]]; then
  postgres_container_id="$(docker compose -f "$COMPOSE_FILE" ps -q postgres)"
  minio_container_id="$(docker compose -f "$COMPOSE_FILE" ps -q minio)"

  if [[ -n "$postgres_container_id" && -n "$minio_container_id" ]]; then
    COMPOSE_FILE="$COMPOSE_FILE" BACKUP_ROOT="$BACKUP_ROOT" "$ROOT_DIR/infra/scripts/backup.sh"
  else
    echo "skipping pre-reset backup because postgres/minio are not both running"
  fi
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" down -v --remove-orphans

if [[ "$RESET_DELETE_BACKUPS" == "true" ]]; then
  mkdir -p "$BACKUP_ROOT"
  backup_root_real="$(cd "$BACKUP_ROOT" && pwd)"

  if [[ "$backup_root_real" == "/" ]]; then
    echo "BACKUP_ROOT must not resolve to /" >&2
    exit 1
  fi

  find "$backup_root_real" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
fi

if [[ "$RESET_START_STACK" == "true" ]]; then
  DOCKER_BUILDKIT=0 docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" up -d --build
fi

if [[ "$RESET_BOOTSTRAP_AFTER_START" == "true" ]]; then
  COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/infra/scripts/bootstrap.sh"
fi

echo "reset completed"
