#!/usr/bin/env bash
set -euo pipefail

required_scripts=(
  "infra/scripts/bootstrap.sh"
  "infra/scripts/apply-prisma-migrations.sh"
  "infra/scripts/vault-init.sh"
  "infra/scripts/seed-admin.sh"
  "infra/scripts/minio-init.sh"
  "infra/scripts/backup.sh"
  "infra/scripts/restore-smoke.sh"
  "infra/scripts/tests/env-loader-safety.sh"
  "infra/scripts/tests/scope-accuracy.sh"
  "infra/scripts/tests/hardening-baseline.sh"
  "infra/scripts/tests/backup-restore-guards.sh"
)

required_files=(
  "infra/scripts/lib/env.sh"
)

for script in "${required_scripts[@]}"; do
  if [[ ! -x "$script" ]]; then
    echo "script is missing or not executable: $script" >&2
    exit 1
  fi
done

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "required file is missing: $file" >&2
    exit 1
  fi
done

echo "bootstrap script checks passed"
