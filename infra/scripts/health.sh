#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/docker-compose.yml}"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo ".env not found" >&2
  exit 1
fi

set -a
source "$ROOT_DIR/.env"
set +a

curl -fsS "http://localhost:${CADDY_HTTP_PORT}/v1/health/live" >/dev/null
curl -fsS "http://localhost:${CADDY_HTTP_PORT}/v1/health/ready" >/dev/null

docker compose -f "$COMPOSE_FILE" ps
