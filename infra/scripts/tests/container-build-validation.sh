#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.example}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "compose file missing: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file missing: $ENV_FILE" >&2
  exit 1
fi

build_output="$(mktemp)"
trap 'rm -f "$build_output"' EXIT

set +e
DOCKER_BUILDKIT=0 docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build api worker >"$build_output" 2>&1
build_exit_code=$?
set -e

if [[ "$build_exit_code" -ne 0 ]]; then
  cat "$build_output" >&2
  if rg -n 'ENOTFOUND|EAI_AGAIN|ETIMEDOUT|binaries\.prisma\.sh|registry\.npmjs\.org' "$build_output" >/dev/null 2>&1; then
    echo "container build validation failed due registry/network dependency resolution errors" >&2
  fi
  exit "$build_exit_code"
fi

cat "$build_output"

echo "container build validation passed"
