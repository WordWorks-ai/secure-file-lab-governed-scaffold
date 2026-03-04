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

running_services="$(docker compose --env-file .env -f infra/compose/docker-compose.yml ps --services --status running 2>/dev/null || true)"
if grep -qx "caddy" <<<"$running_services" && grep -qx "webhook-sink" <<<"$running_services"; then
  curl -fsS -X DELETE http://localhost:8080/webhook-sink/v1/webhooks/events >/dev/null
  capture_response="$(curl -fsS -X POST http://localhost:8080/webhook-sink/v1/webhooks/capture \
    -H 'content-type: application/json' \
    -d '{"event":"stage15.webhook.capture","source":"stage15-check"}')"
  if ! grep -Fq '"accepted":true' <<<"$capture_response"; then
    echo "stage15 webhook-sink check failed: capture endpoint did not accept payload" >&2
    exit 1
  fi
  events_response="$(curl -fsS http://localhost:8080/webhook-sink/v1/webhooks/events?limit=1)"
  if ! grep -Fq '"stage15.webhook.capture"' <<<"$events_response"; then
    echo "stage15 webhook-sink check failed: capture payload not found in events endpoint" >&2
    exit 1
  fi
fi

echo "stage15 webhook-sink checks passed"
