#!/usr/bin/env bash
set -euo pipefail

content_services="$(docker compose --env-file .env.example -f infra/compose/docker-compose.yml --profile content config --services)"

for service in preview ocr; do
  if ! grep -qx "$service" <<<"$content_services"; then
    echo "stage12 content check failed: missing compose service $service" >&2
    exit 1
  fi
done

for marker in \
  "CONTENT_PIPELINE_ENABLED=" \
  "CONTENT_JOB_ATTEMPTS=" \
  "CONTENT_PREVIEW_MAX_CHARS=" \
  "CONTENT_OCR_MAX_CHARS=" \
  "PREVIEW_BASE_URL=" \
  "OCR_BASE_URL="; do
  if ! grep -Fq "$marker" .env.example; then
    echo "stage12 content check failed: missing env marker $marker" >&2
    exit 1
  fi
done

if [[ ! -f apps/preview/server.mjs ]]; then
  echo "stage12 content check failed: missing preview service shell" >&2
  exit 1
fi

if [[ ! -f apps/ocr/server.mjs ]]; then
  echo "stage12 content check failed: missing ocr service shell" >&2
  exit 1
fi

if [[ ! -f apps/api/src/modules/files/content-queue.service.ts ]]; then
  echo "stage12 content check failed: missing API content queue service" >&2
  exit 1
fi

if [[ ! -f apps/worker/src/modules/jobs/contracts/content-jobs.contract.ts ]]; then
  echo "stage12 content check failed: missing worker content queue contract" >&2
  exit 1
fi

if ! grep -Fq "@Get(':fileId/artifacts')" apps/api/src/modules/files/files.controller.ts; then
  echo "stage12 content check failed: missing file artifacts endpoint" >&2
  exit 1
fi

if ! grep -Fq "CONTENT_PROCESS_QUEUE_NAME" apps/worker/src/modules/jobs/jobs.service.ts; then
  echo "stage12 content check failed: worker content queue wiring missing" >&2
  exit 1
fi

if ! grep -Fq "CONTENT_PROCESS_QUEUE_NAME" apps/api/src/modules/files/content-queue.service.ts; then
  echo "stage12 content check failed: api content queue wiring missing" >&2
  exit 1
fi

echo "stage12 content checks passed"
