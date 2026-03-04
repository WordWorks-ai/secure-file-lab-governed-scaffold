#!/usr/bin/env bash
set -euo pipefail

for marker in \
  "DLP_ADMIN_OVERRIDE_REQUIRE_REASON=" \
  "DLP_ADMIN_OVERRIDE_MIN_REASON_LENGTH=" \
  "DLP_ADMIN_OVERRIDE_REQUIRE_TICKET=" \
  "DLP_ADMIN_OVERRIDE_TICKET_PATTERN="; do
  if ! grep -Fq "$marker" .env.example; then
    echo "stage19 dlp hardening check failed: missing env marker $marker" >&2
    exit 1
  fi
done

for marker in \
  "DLP_ADMIN_OVERRIDE_REQUIRE_REASON: \${DLP_ADMIN_OVERRIDE_REQUIRE_REASON:-true}" \
  "DLP_ADMIN_OVERRIDE_MIN_REASON_LENGTH: \${DLP_ADMIN_OVERRIDE_MIN_REASON_LENGTH:-24}" \
  "DLP_ADMIN_OVERRIDE_REQUIRE_TICKET: \${DLP_ADMIN_OVERRIDE_REQUIRE_TICKET:-false}" \
  "DLP_ADMIN_OVERRIDE_TICKET_PATTERN: \${DLP_ADMIN_OVERRIDE_TICKET_PATTERN:-^INC-[0-9][0-9][0-9][0-9]+$}"; do
  if ! grep -Fq "$marker" infra/compose/docker-compose.yml; then
    echo "stage19 dlp hardening check failed: missing compose marker $marker" >&2
    exit 1
  fi
done

if [[ ! -f apps/api/src/modules/dlp/dlp.service.ts ]]; then
  echo "stage19 dlp hardening check failed: missing API dlp service" >&2
  exit 1
fi

for marker in \
  "evaluateAdminOverride" \
  "non_overridable_match" \
  "secret.private_key_block" \
  "pii.credit_card"; do
  if ! grep -Fq "$marker" apps/api/src/modules/dlp/dlp.service.ts; then
    echo "stage19 dlp hardening check failed: missing dlp service marker $marker" >&2
    exit 1
  fi
done

for file in \
  "apps/api/src/modules/files/dto/upload-file.dto.ts" \
  "apps/api/src/modules/shares/dto/create-share.dto.ts"; do
  if [[ ! -f "$file" ]]; then
    echo "stage19 dlp hardening check failed: missing dto file $file" >&2
    exit 1
  fi
  if ! grep -Fq "dlpOverrideReason" "$file"; then
    echo "stage19 dlp hardening check failed: missing dlpOverrideReason in $file" >&2
    exit 1
  fi
  if ! grep -Fq "dlpOverrideTicket" "$file"; then
    echo "stage19 dlp hardening check failed: missing dlpOverrideTicket in $file" >&2
    exit 1
  fi
done

for marker in \
  "overrideEvaluationReason" \
  "file.upload.dlp.override"; do
  if ! grep -Fq "$marker" apps/api/src/modules/files/files.service.ts; then
    echo "stage19 dlp hardening check failed: missing files service marker $marker" >&2
    exit 1
  fi
done

for marker in \
  "overrideEvaluationReason" \
  "share.create.dlp.override" \
  "derivedText"; do
  if ! grep -Fq "$marker" apps/api/src/modules/shares/shares.service.ts; then
    echo "stage19 dlp hardening check failed: missing shares service marker $marker" >&2
    exit 1
  fi
done

for marker in \
  "allows admin-governed DLP override on upload when reason is provided" \
  "denies admin DLP override on non-overridable upload matches"; do
  if ! grep -Fq "$marker" apps/api/test/files.e2e.test.ts; then
    echo "stage19 dlp hardening check failed: missing files e2e marker $marker" >&2
    exit 1
  fi
done

for marker in \
  "denies admin DLP override on share creation when governance reason is missing" \
  "denies share creation when DLP detects sensitive derived artifact text"; do
  if ! grep -Fq "$marker" apps/api/test/shares.e2e.test.ts; then
    echo "stage19 dlp hardening check failed: missing shares e2e marker $marker" >&2
    exit 1
  fi
done

if [[ ! -f docs/status/phase-19.md ]]; then
  echo "stage19 dlp hardening check failed: missing phase-19 status doc" >&2
  exit 1
fi

echo "stage19 dlp hardening checks passed"
