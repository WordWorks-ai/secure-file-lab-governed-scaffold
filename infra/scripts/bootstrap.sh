#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/docker-compose.yml}"
WAIT_SCRIPT="$ROOT_DIR/infra/scripts/lib/wait-for-health.sh"
ENV_LIB="$ROOT_DIR/infra/scripts/lib/env.sh"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo ".env not found. Copy .env.example to .env before bootstrap." >&2
  exit 1
fi

source "$ENV_LIB"

bootstrap_admin_email_override="${BOOTSTRAP_ADMIN_EMAIL:-}"
bootstrap_admin_password_hash_override="${BOOTSTRAP_ADMIN_PASSWORD_HASH:-}"

load_env_file "$ROOT_DIR/.env"

if [[ -n "$bootstrap_admin_email_override" ]]; then
  BOOTSTRAP_ADMIN_EMAIL="$bootstrap_admin_email_override"
fi

if [[ -n "$bootstrap_admin_password_hash_override" ]]; then
  BOOTSTRAP_ADMIN_PASSWORD_HASH="$bootstrap_admin_password_hash_override"
fi

required_vars=(
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
  MINIO_ROOT_USER
  MINIO_ROOT_PASSWORD
  MINIO_BUCKET
  VAULT_DEV_ROOT_TOKEN
  VAULT_TRANSIT_KEY_NAME
  BOOTSTRAP_ADMIN_EMAIL
  BOOTSTRAP_ADMIN_PASSWORD_HASH
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "required environment variable is missing: ${var_name}" >&2
    exit 1
  fi
done

if [[ "${BOOTSTRAP_ADMIN_PASSWORD_HASH}" == "SET_ARGON2ID_HASH_HERE" ]]; then
  echo "BOOTSTRAP_ADMIN_PASSWORD_HASH must be set to a real Argon2id hash before bootstrap." >&2
  echo "Generate with: pnpm --filter @sfl/api hash:password -- '<password>'" >&2
  exit 1
fi

if [[ "${BOOTSTRAP_ADMIN_PASSWORD_HASH}" != \$argon2id\$* ]]; then
  echo "BOOTSTRAP_ADMIN_PASSWORD_HASH must begin with \$argon2id\$" >&2
  exit 1
fi

DOCKER_BUILDKIT=0 docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" up -d --build

"$WAIT_SCRIPT" "$COMPOSE_FILE" postgres 180
"$WAIT_SCRIPT" "$COMPOSE_FILE" redis 180
"$WAIT_SCRIPT" "$COMPOSE_FILE" minio 240
"$WAIT_SCRIPT" "$COMPOSE_FILE" vault 180
"$WAIT_SCRIPT" "$COMPOSE_FILE" clamav 300
"$WAIT_SCRIPT" "$COMPOSE_FILE" mailhog 180
"$WAIT_SCRIPT" "$COMPOSE_FILE" api 240
"$WAIT_SCRIPT" "$COMPOSE_FILE" worker 240

COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/infra/scripts/apply-prisma-migrations.sh"

docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" --profile bootstrap run --rm minio_init

COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/infra/scripts/vault-init.sh"
COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/infra/scripts/seed-admin.sh"

echo "bootstrap completed"
