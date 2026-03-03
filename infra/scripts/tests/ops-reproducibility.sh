#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/docker-compose.yml}"
ENV_LIB="$ROOT_DIR/infra/scripts/lib/env.sh"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo ".env not found. Copy .env.example to .env before running ops reproducibility test." >&2
  exit 1
fi

bootstrap_admin_hash_override="${BOOTSTRAP_ADMIN_PASSWORD_HASH:-}"

source "$ENV_LIB"
load_env_file "$ROOT_DIR/.env"

if [[ -n "$bootstrap_admin_hash_override" ]]; then
  BOOTSTRAP_ADMIN_PASSWORD_HASH="$bootstrap_admin_hash_override"
fi

if [[ -z "${BOOTSTRAP_ADMIN_PASSWORD_HASH:-}" || "${BOOTSTRAP_ADMIN_PASSWORD_HASH}" == "SET_ARGON2ID_HASH_HERE" ]]; then
  echo "BOOTSTRAP_ADMIN_PASSWORD_HASH must be set to a real Argon2id hash in .env or exported in the shell" >&2
  exit 1
fi

echo "[1/5] reset to clean state (down -v)"
docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" down -v --remove-orphans

echo "[2/5] clean boot via bootstrap"
BOOTSTRAP_ADMIN_PASSWORD_HASH="$BOOTSTRAP_ADMIN_PASSWORD_HASH" "$ROOT_DIR/infra/scripts/bootstrap.sh"

# idempotency check
echo "[3/5] re-run bootstrap against existing state"
BOOTSTRAP_ADMIN_PASSWORD_HASH="$BOOTSTRAP_ADMIN_PASSWORD_HASH" "$ROOT_DIR/infra/scripts/bootstrap.sh"

echo "[4/5] partial restart check (redis + worker)"
docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" restart redis worker
"$ROOT_DIR/infra/scripts/lib/wait-for-health.sh" "$COMPOSE_FILE" redis 180
"$ROOT_DIR/infra/scripts/lib/wait-for-health.sh" "$COMPOSE_FILE" worker 180
"$ROOT_DIR/infra/scripts/lib/wait-for-health.sh" "$COMPOSE_FILE" api 180
"$ROOT_DIR/infra/scripts/health.sh"

echo "[5/5] restart stack without volume reset"
docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" down --remove-orphans
DOCKER_BUILDKIT=0 docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" up -d --build
"$ROOT_DIR/infra/scripts/lib/wait-for-health.sh" "$COMPOSE_FILE" api 180
"$ROOT_DIR/infra/scripts/health.sh"

echo "ops reproducibility smoke passed"
