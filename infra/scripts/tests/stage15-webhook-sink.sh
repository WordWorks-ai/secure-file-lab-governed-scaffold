#!/usr/bin/env bash
set -euo pipefail

compose_services="$(docker compose --env-file .env.example -f infra/compose/docker-compose.yml config --services)"

if ! grep -qx "webhook-sink" <<<"$compose_services"; then
  echo "stage15 webhook-sink check failed: missing compose service webhook-sink" >&2
  exit 1
fi

for marker in \
  "WEBHOOK_SINK_PORT=" \
  "WEBHOOK_SINK_HTTP_PORT=" \
  "WEBHOOK_SINK_MAX_EVENTS="; do
  if ! grep -Fq "$marker" .env.example; then
    echo "stage15 webhook-sink check failed: missing env marker $marker" >&2
    exit 1
  fi
done

if [[ ! -f apps/webhook-sink/server.mjs ]]; then
  echo "stage15 webhook-sink check failed: missing webhook-sink service shell" >&2
  exit 1
fi

if ! grep -Fq "handle_path /webhook-sink*" infra/caddy/Caddyfile; then
  echo "stage15 webhook-sink check failed: missing Caddy route /webhook-sink*" >&2
  exit 1
fi

if ! grep -Fq "reverse_proxy webhook-sink:3020" infra/caddy/Caddyfile; then
  echo "stage15 webhook-sink check failed: missing Caddy proxy target webhook-sink:3020" >&2
  exit 1
fi

echo "stage15 webhook-sink checks passed"
