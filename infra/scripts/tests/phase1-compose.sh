#!/usr/bin/env bash
set -euo pipefail

compose_output="$(docker compose --env-file .env.example -f infra/compose/docker-compose.yml config --services)"

required_services=(
  "caddy"
  "api"
  "worker"
  "postgres"
  "redis"
  "minio"
  "vault"
  "clamav"
  "mailhog"
  "webhook-sink"
  "backup"
)

for service in "${required_services[@]}"; do
  if ! grep -qx "$service" <<<"$compose_output"; then
    echo "missing required compose service: $service" >&2
    exit 1
  fi
done

echo "phase1 compose service checks passed"
