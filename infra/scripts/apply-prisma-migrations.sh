#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/docker-compose.yml}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$ROOT_DIR/apps/api/prisma/migrations}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
ALLOW_IDEMPOTENT_REPLAY="${ALLOW_IDEMPOTENT_REPLAY:-true}"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file not found: $ENV_FILE" >&2
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

already_exists_pattern='already exists|duplicate key value|column .* already exists|type .* already exists|relation .* already exists|extension .* already exists|constraint .* already exists'

for migration_file in "${migration_files[@]}"; do
  echo "applying migration: $migration_file"
  set +e
  migration_output="$(
    cat "$migration_file" | docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
      psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" 2>&1
  )"
  migration_status=$?
  set -e

  if [[ "$migration_status" -eq 0 ]]; then
    printf '%s\n' "$migration_output"
    continue
  fi

  if [[ "$ALLOW_IDEMPOTENT_REPLAY" == "true" ]] && grep -Eiq "$already_exists_pattern" <<<"$migration_output"; then
    printf '%s\n' "$migration_output"
    echo "migration replay encountered existing-object collision(s); continuing"
    continue
  fi

  printf '%s\n' "$migration_output" >&2
  exit "$migration_status"
done

echo "all migration files applied"
