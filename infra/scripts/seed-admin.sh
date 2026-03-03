#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-infra/compose/docker-compose.yml}"

if [[ -z "${BOOTSTRAP_ADMIN_EMAIL:-}" ]]; then
  echo "BOOTSTRAP_ADMIN_EMAIL is required" >&2
  exit 1
fi

if [[ ! "${BOOTSTRAP_ADMIN_EMAIL}" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
  echo "BOOTSTRAP_ADMIN_EMAIL must be a valid email address" >&2
  exit 1
fi

password_hash="${BOOTSTRAP_ADMIN_PASSWORD_HASH:-}"
if [[ -z "$password_hash" || "$password_hash" == "SET_ARGON2ID_HASH_HERE" ]]; then
  echo "BOOTSTRAP_ADMIN_PASSWORD_HASH must be set to a real Argon2id hash" >&2
  echo "Generate one with: pnpm --filter @sfl/api hash:password -- '<password>'" >&2
  exit 1
fi

if [[ "$password_hash" != \$argon2id\$* ]]; then
  echo "BOOTSTRAP_ADMIN_PASSWORD_HASH must begin with \$argon2id\$" >&2
  exit 1
fi

if [[ -z "${POSTGRES_USER:-}" || -z "${POSTGRES_DB:-}" ]]; then
  echo "POSTGRES_USER and POSTGRES_DB are required in environment" >&2
  exit 1
fi

docker compose -f "$COMPOSE_FILE" exec -T postgres psql \
  -v ON_ERROR_STOP=1 \
  -v admin_email="$BOOTSTRAP_ADMIN_EMAIL" \
  -v admin_password_hash="$password_hash" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" <<'SQL'
INSERT INTO users(id, email, password_hash, role)
VALUES (gen_random_uuid(), :'admin_email', :'admin_password_hash', 'admin')
ON CONFLICT(email)
DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  updated_at = NOW();
SQL

echo "admin seed ensured for ${BOOTSTRAP_ADMIN_EMAIL}"
