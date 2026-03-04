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
  "docs/runbooks/bootstrap.md"
  "docs/runbooks/backup-and-restore.md"
  "docs/runbooks/local-development.md"
  "docs/status/phase-00.md"
  "docs/status/phase-01.md"
  "docs/status/phase-02.md"
  "docs/status/phase-03.md"
  "docs/status/phase-04.md"
  "infra/scripts/tests/scope-accuracy.sh"
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
