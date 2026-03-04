#!/usr/bin/env bash
set -euo pipefail

compose_services="$(docker compose --env-file .env.example -f infra/compose/docker-compose.yml config --services)"

required_services=(
  "web"
  "admin"
  "realtime"
)

for service in "${required_services[@]}"; do
  if ! grep -qx "$service" <<<"$compose_services"; then
    echo "stage9 routing check failed: missing compose service $service" >&2
    exit 1
  fi
done

required_caddy_markers=(
  "handle_path /admin*"
  "handle_path /realtime*"
  "reverse_proxy web:80"
)

for marker in "${required_caddy_markers[@]}"; do
  if ! grep -Fq "$marker" infra/caddy/Caddyfile; then
    echo "stage9 routing check failed: missing Caddy route marker $marker" >&2
    exit 1
  fi
done

running_services="$(docker compose --env-file .env -f infra/compose/docker-compose.yml ps --services --status running 2>/dev/null || true)"
if grep -qx "caddy" <<<"$running_services" \
  && grep -qx "web" <<<"$running_services" \
  && grep -qx "admin" <<<"$running_services" \
  && grep -qx "realtime" <<<"$running_services"; then
  curl -fsS http://localhost:8080/ >/dev/null
  curl -fsS http://localhost:8080/admin/ >/dev/null
  curl -fsS http://localhost:8080/realtime/health/live >/dev/null
fi

echo "stage9 routing checks passed"
