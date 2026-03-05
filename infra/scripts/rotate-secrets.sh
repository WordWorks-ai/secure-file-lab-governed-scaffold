#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
ENV_LIB="$ROOT_DIR/infra/scripts/lib/env.sh"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/secret-rotation}"
ROTATE_VAULT_TRANSIT="${ROTATE_VAULT_TRANSIT:-false}"
ROTATE_CONFIRM="${ROTATE_CONFIRM:-NO}"

if [[ "$ROTATE_CONFIRM" != "YES" ]]; then
  echo "rotation aborted: set ROTATE_CONFIRM=YES to proceed" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file not found: $ENV_FILE" >&2
  exit 1
fi

source "$ENV_LIB"
load_env_file "$ENV_FILE"

generate_secret() {
  node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))"
}

update_env_key() {
  local file="$1"
  local key="$2"
  local value="$3"
  local next_file
  next_file="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { updated=0 }
    {
      if ($0 ~ ("^" key "=")) {
        print key "=" value
        updated=1
        next
      }
      print
    }
    END {
      if (!updated) {
        print key "=" value
      }
    }
  ' "$file" >"$next_file"
  mv "$next_file" "$file"
}

mkdir -p "$BACKUP_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_env_file="$BACKUP_DIR/.env.$timestamp.bak"
rotation_manifest="$BACKUP_DIR/rotation.$timestamp.json"
work_env_file="$(mktemp)"
trap 'rm -f "$work_env_file"' EXIT

cp "$ENV_FILE" "$backup_env_file"
cp "$ENV_FILE" "$work_env_file"

rotated_keys=(
  "JWT_ACCESS_SECRET"
  "JWT_REFRESH_SECRET"
  "MFA_TOTP_SECRET_KEY"
)

for key in "${rotated_keys[@]}"; do
  update_env_key "$work_env_file" "$key" "$(generate_secret)"
done

cp "$work_env_file" "$ENV_FILE"

vault_rotated="false"
if [[ "$ROTATE_VAULT_TRANSIT" == "true" ]]; then
  required_vault_vars=(
    VAULT_ADDR
    VAULT_DEV_ROOT_TOKEN
    VAULT_TRANSIT_KEY_NAME
  )

  for var_name in "${required_vault_vars[@]}"; do
    if [[ -z "${!var_name:-}" ]]; then
      echo "required vault variable is missing for transit rotation: ${var_name}" >&2
      exit 1
    fi
  done

  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T vault sh -lc \
    "VAULT_ADDR='$VAULT_ADDR' VAULT_TOKEN='$VAULT_DEV_ROOT_TOKEN' vault write -f transit/keys/$VAULT_TRANSIT_KEY_NAME/rotate >/dev/null"
  vault_rotated="true"
fi

cat >"$rotation_manifest" <<MANIFEST
{
  "timestamp": "$timestamp",
  "env_file": "$ENV_FILE",
  "backup_env_file": "$backup_env_file",
  "rotated_keys": [
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "MFA_TOTP_SECRET_KEY"
  ],
  "vault_transit_rotated": $vault_rotated,
  "vault_transit_key_name": "${VAULT_TRANSIT_KEY_NAME:-}"
}
MANIFEST

echo "secret rotation completed"
echo "env file updated: $ENV_FILE"
echo "env backup: $backup_env_file"
echo "rotation manifest: $rotation_manifest"
echo "restart the platform to apply new application secrets"
