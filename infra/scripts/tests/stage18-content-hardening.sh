#!/usr/bin/env bash
set -euo pipefail

for marker in \
  "CONTENT_JOB_BACKOFF_DELAY_MS=" \
  "CONTENT_PIPELINE_FAIL_CLOSED=" \
  "CONTENT_DERIVATIVES_MAX_BYTES="; do
  if ! grep -Fq "$marker" .env.example; then
    echo "stage18 content hardening check failed: missing env marker $marker" >&2
    exit 1
  fi
done

for marker in \
  "CONTENT_JOB_BACKOFF_DELAY_MS: \${CONTENT_JOB_BACKOFF_DELAY_MS:-2000}" \
  "CONTENT_PIPELINE_FAIL_CLOSED: \${CONTENT_PIPELINE_FAIL_CLOSED:-true}" \
  "CONTENT_DERIVATIVES_MAX_BYTES: \${CONTENT_DERIVATIVES_MAX_BYTES:-262144}"; do
  if ! grep -Fq "$marker" infra/compose/docker-compose.yml; then
    echo "stage18 content hardening check failed: missing compose marker $marker" >&2
    exit 1
  fi
done

if [[ ! -f apps/worker/src/modules/jobs/services/worker-content-derivatives.service.ts ]]; then
  echo "stage18 content hardening check failed: missing worker content derivatives service" >&2
  exit 1
fi

if [[ ! -f apps/worker/test/worker-content-derivatives.service.test.ts ]]; then
  echo "stage18 content hardening check failed: missing derivatives fidelity test" >&2
  exit 1
fi

for marker in \
  "file.content.retry" \
  "file.content.blocked" \
  "isContentFailClosedEnabled" \
  "getContentJobBackoffDelayMs"; do
  if ! grep -Fq "$marker" apps/worker/src/modules/jobs/jobs.service.ts; then
    echo "stage18 content hardening check failed: missing jobs marker $marker" >&2
    exit 1
  fi
done

if ! grep -Fq "CONTENT_DERIVATIVES_MAX_BYTES" apps/worker/src/modules/jobs/services/worker-content-derivatives.service.ts; then
  echo "stage18 content hardening check failed: derivatives max bytes guard missing" >&2
  exit 1
fi

for marker in \
  "emits retry audit on non-terminal content processing errors" \
  "keeps file active on terminal content error when fail-closed is disabled"; do
  if ! grep -Fq "$marker" apps/worker/test/jobs.service.test.ts; then
    echo "stage18 content hardening check failed: missing worker job test marker $marker" >&2
    exit 1
  fi
done

echo "stage18 content hardening checks passed"
