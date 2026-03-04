#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "README.md"
  "IMPLEMENTATION_PLAN.md"
  "docs/adr/ADR-001-architecture-and-stack.md"
  "docs/adr/ADR-002-file-lifecycle.md"
  "docs/adr/ADR-003-encryption-and-key-management.md"
  "docs/threat-model.md"
  "docs/security-baseline.md"
  "docs/data-model.md"
  "docs/architecture-service-map.md"
  "docs/runbooks/bootstrap.md"
  "docs/runbooks/backup-and-restore.md"
  "docs/runbooks/reset-bootstrap-restore.md"
  "docs/runbooks/vault-recovery.md"
  "docs/runbooks/local-development.md"
  "docs/status/phase-00.md"
  "docs/status/phase-01.md"
  "docs/status/phase-02.md"
  "docs/status/phase-03.md"
  "docs/status/phase-04.md"
  "docs/status/phase-05.md"
  "docs/status/phase-06.md"
  "docs/status/phase-07.md"
  "docs/status/phase-08.md"
  "docs/status/phase-09.md"
  "docs/status/phase-10.md"
  "docs/status/phase-11.md"
  "docs/status/phase-12.md"
  "docs/status/phase-13.md"
  "docs/status/phase-14.md"
  "infra/scripts/tests/scope-accuracy.sh"
  "infra/scripts/tests/stage9-routing.sh"
  "infra/scripts/tests/stage10-policy.sh"
  "infra/scripts/tests/stage11-search.sh"
  "infra/scripts/tests/stage12-content.sh"
  "infra/scripts/tests/stage13-dlp.sh"
  "infra/scripts/tests/stage14-observability.sh"
  "infra/scripts/tests/dependency-audit.sh"
  "infra/scripts/tests/container-build-validation.sh"
  "package.json"
  "pnpm-lock.yaml"
  "pnpm-workspace.yaml"
  "Makefile"
  ".github/workflows/ci.yml"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "missing required file: $file" >&2
    exit 1
  fi
done

echo "phase0 structure checks passed"
