#!/usr/bin/env bash
set -euo pipefail

dlp_services="$(docker compose --env-file .env.example -f infra/compose/docker-compose.yml --profile dlp config --services)"

if ! grep -qx "dlp" <<<"$dlp_services"; then
  echo "stage13 dlp check failed: missing compose service dlp" >&2
  exit 1
fi

for marker in \
  "DLP_ENGINE_ENABLED=" \
  "DLP_POLICY_ID=" \
  "DLP_MAX_SCAN_BYTES=" \
  "DLP_ADMIN_OVERRIDE_ENABLED=" \
  "DLP_BASE_URL="; do
  if ! grep -Fq "$marker" .env.example; then
    echo "stage13 dlp check failed: missing env marker $marker" >&2
    exit 1
  fi
done

if [[ ! -f apps/dlp/server.mjs ]]; then
  echo "stage13 dlp check failed: missing dlp service shell" >&2
  exit 1
fi

if [[ ! -f infra/dlp/policy-baseline.json ]]; then
  echo "stage13 dlp check failed: missing baseline dlp policy set" >&2
  exit 1
fi

if [[ ! -f apps/api/src/modules/dlp/dlp.module.ts ]]; then
  echo "stage13 dlp check failed: missing API dlp module" >&2
  exit 1
fi

if [[ ! -f apps/api/src/modules/dlp/dlp.service.ts ]]; then
  echo "stage13 dlp check failed: missing API dlp service" >&2
  exit 1
fi

if ! grep -Fq "file.upload.dlp.blocked" apps/api/src/modules/files/files.service.ts; then
  echo "stage13 dlp check failed: file upload dlp enforcement missing" >&2
  exit 1
fi

if ! grep -Fq "share.create.dlp.blocked" apps/api/src/modules/shares/shares.service.ts; then
  echo "stage13 dlp check failed: share create dlp enforcement missing" >&2
  exit 1
fi

echo "stage13 dlp checks passed"
