#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/docker-compose.yml}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$ROOT_DIR/apps/api/prisma/migrations}"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

if [[ -z "${POSTGRES_USER:-}" || -z "${POSTGRES_DB:-}" ]]; then
  echo "POSTGRES_USER and POSTGRES_DB are required" >&2
  exit 1
fi

migration_files=()
while IFS= read -r migration_file; do
  migration_files+=("$migration_file")
done < <(find "$MIGRATIONS_DIR" -mindepth 2 -maxdepth 2 -type f -name 'migration.sql' | sort)

if (( ${#migration_files[@]} == 0 )); then
  echo "no migration files found under $MIGRATIONS_DIR" >&2
  exit 1
fi

for migration_file in "${migration_files[@]}"; do
  echo "applying migration: $migration_file"
  cat "$migration_file" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
done

echo "all migration files applied"
