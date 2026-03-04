#!/usr/bin/env bash
set -euo pipefail

search_services="$(docker compose --env-file .env.example -f infra/compose/docker-compose.yml --profile search config --services)"

for service in opensearch opensearch_dashboards; do
  if ! grep -qx "$service" <<<"$search_services"; then
    echo "stage11 search check failed: missing compose service $service" >&2
    exit 1
  fi
done

for marker in \
  "OPENSEARCH_ENABLED=" \
  "OPENSEARCH_BASE_URL=" \
  "OPENSEARCH_FILES_INDEX=" \
  "OPENSEARCH_FAIL_SAFE_DB_FALLBACK=" \
  "SEARCH_INDEX_JOB_ATTEMPTS="; do
  if ! grep -Fq "$marker" .env.example; then
    echo "stage11 search check failed: missing env marker $marker" >&2
    exit 1
  fi
done

if [[ ! -f apps/api/src/modules/search/search.module.ts ]]; then
  echo "stage11 search check failed: missing API search module" >&2
  exit 1
fi

if [[ ! -f apps/worker/src/modules/jobs/contracts/search-index-jobs.contract.ts ]]; then
  echo "stage11 search check failed: missing worker search contract" >&2
  exit 1
fi

if ! grep -Fq "@Controller('search')" apps/api/src/modules/search/search.controller.ts; then
  echo "stage11 search check failed: missing search controller route" >&2
  exit 1
fi

if ! grep -Fq "SEARCH_INDEX_QUEUE_NAME" apps/api/src/modules/search/search-queue.service.ts; then
  echo "stage11 search check failed: API search queue wiring missing" >&2
  exit 1
fi

if ! grep -Fq "SEARCH_INDEX_QUEUE_NAME" apps/worker/src/modules/jobs/jobs.service.ts; then
  echo "stage11 search check failed: worker search queue wiring missing" >&2
  exit 1
fi

echo "stage11 search checks passed"
