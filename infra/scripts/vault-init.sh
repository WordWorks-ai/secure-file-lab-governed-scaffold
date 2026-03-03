#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-infra/compose/docker-compose.yml}"

if [[ -z "${VAULT_DEV_ROOT_TOKEN:-}" ]]; then
  echo "VAULT_DEV_ROOT_TOKEN is required" >&2
  exit 1
fi

if [[ -z "${VAULT_TRANSIT_KEY_NAME:-}" ]]; then
  echo "VAULT_TRANSIT_KEY_NAME is required" >&2
  exit 1
fi

docker compose -f "$COMPOSE_FILE" exec -T vault sh -lc "\
  export VAULT_ADDR=http://127.0.0.1:8200; \
  export VAULT_TOKEN=${VAULT_DEV_ROOT_TOKEN}; \
  vault secrets enable -path=transit transit >/dev/null 2>&1 || true; \
  vault write -f transit/keys/${VAULT_TRANSIT_KEY_NAME} >/dev/null 2>&1 || true; \
  echo 'vault transit configured'
"
