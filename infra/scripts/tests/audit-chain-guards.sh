#!/usr/bin/env bash
set -euo pipefail

for required_file in \
  "apps/api/prisma/migrations/20260304220000_audit_chain_hardening/migration.sql" \
  "infra/scripts/verify-audit-chain.sh"; do
  if [[ ! -f "$required_file" ]]; then
    echo "audit chain guard failed: missing file $required_file" >&2
    exit 1
  fi
done

if [[ ! -x "infra/scripts/verify-audit-chain.sh" ]]; then
  echo "audit chain guard failed: verify script is not executable" >&2
  exit 1
fi

for marker in \
  "prev_event_hash" \
  "event_hash" \
  "chain_version"; do
  if ! grep -Fq "$marker" apps/api/prisma/schema.prisma; then
    echo "audit chain guard failed: schema marker missing $marker" >&2
    exit 1
  fi
done

for marker in \
  "prevEventHash" \
  "eventHash" \
  "chainVersion" \
  "computeEventHash"; do
  if ! grep -Fq "$marker" apps/api/src/modules/audit/audit.service.ts; then
    echo "audit chain guard failed: api audit service marker missing $marker" >&2
    exit 1
  fi
done

for marker in \
  "prevEventHash" \
  "eventHash" \
  "chainVersion"; do
  if ! grep -Fq "$marker" apps/worker/src/modules/audit/audit.service.ts; then
    echo "audit chain guard failed: worker audit service marker missing $marker" >&2
    exit 1
  fi
done

for marker in \
  "prevEventHash" \
  "eventHash" \
  "chainVersion"; do
  if ! grep -Fq "$marker" apps/api/src/modules/audit/audit.controller.ts; then
    echo "audit chain guard failed: audit controller marker missing $marker" >&2
    exit 1
  fi
done

for marker in \
  "sha256-v1" \
  "audit_events" \
  "eventHash mismatch"; do
  if ! grep -Fq "$marker" infra/scripts/verify-audit-chain.sh; then
    echo "audit chain guard failed: verify script marker missing $marker" >&2
    exit 1
  fi
done

echo "audit chain guard checks passed"
