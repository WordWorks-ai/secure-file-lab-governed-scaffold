#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/docker-compose.yml}"

echo "[demo] Starting platform"
make up

if [[ -z "${BOOTSTRAP_ADMIN_PASSWORD_HASH:-}" ]]; then
  configured_hash="$(grep -E '^BOOTSTRAP_ADMIN_PASSWORD_HASH=' "$ROOT_DIR/.env" | head -n1 | cut -d'=' -f2- || true)"
  if [[ -z "$configured_hash" || "$configured_hash" == "SET_ARGON2ID_HASH_HERE" ]]; then
    echo "[demo] Generating temporary Argon2id admin hash for bootstrap"
    raw_hash_output="$(
      docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" exec -T api \
        pnpm --filter @sfl/api hash:password -- 'demo-session-admin-password'
    )"
    BOOTSTRAP_ADMIN_PASSWORD_HASH="$(printf '%s\n' "$raw_hash_output" | grep '^\$argon2id\$' | tail -n1 || true)"
    if [[ -z "$BOOTSTRAP_ADMIN_PASSWORD_HASH" ]]; then
      echo "[demo] failed to parse generated Argon2id hash from API container output" >&2
      exit 1
    fi
    export BOOTSTRAP_ADMIN_PASSWORD_HASH
  fi
fi

echo "[demo] Running deterministic bootstrap"
make bootstrap

echo "[demo] Verifying service health"
./infra/scripts/health.sh

echo "[demo] Running scaffold and hardening checks"
bash infra/scripts/tests/phase0-structure.sh
bash infra/scripts/tests/phase1-compose.sh
bash infra/scripts/tests/hardening-baseline.sh

echo "[demo] Running backup + restore smoke checks"
bash infra/scripts/tests/backup-restore-guards.sh
./infra/scripts/backup.sh
./infra/scripts/restore-smoke.sh

echo "[demo] Demo validation complete"
