#!/usr/bin/env bash
set -euo pipefail

echo "[demo] Starting platform"
make up

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
