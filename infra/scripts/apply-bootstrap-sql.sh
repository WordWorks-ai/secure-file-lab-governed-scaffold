#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-infra/compose/docker-compose.yml}"
SQL_FILE="${SQL_FILE:-infra/scripts/sql/0001_bootstrap.sql}"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "sql file not found: $SQL_FILE" >&2
  exit 1
fi

cat "$SQL_FILE" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "applied bootstrap SQL from $SQL_FILE"
