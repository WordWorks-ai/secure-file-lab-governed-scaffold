#!/usr/bin/env bash
set -euo pipefail

obs_services="$(docker compose --env-file .env.example -f infra/compose/docker-compose.yml --profile observability config --services)"

for service in prometheus grafana loki promtail; do
  if ! grep -qx "$service" <<<"$obs_services"; then
    echo "stage14 observability check failed: missing compose service $service" >&2
    exit 1
  fi
done

for marker in \
  "METRICS_ENABLED=" \
  "PROMETHEUS_HTTP_PORT=" \
  "LOKI_HTTP_PORT=" \
  "GRAFANA_HTTP_PORT=" \
  "GRAFANA_ADMIN_USER=" \
  "GRAFANA_ADMIN_PASSWORD="; do
  if ! grep -Fq "$marker" .env.example; then
    echo "stage14 observability check failed: missing env marker $marker" >&2
    exit 1
  fi
done

for file in \
  "infra/observability/prometheus.yml" \
  "infra/observability/loki-config.yml" \
  "infra/observability/promtail-config.yml" \
  "infra/observability/grafana/provisioning/datasources/datasources.yml"; do
  if [[ ! -f "$file" ]]; then
    echo "stage14 observability check failed: missing file $file" >&2
    exit 1
  fi
done

if ! grep -Fq "api:3000" infra/observability/prometheus.yml; then
  echo "stage14 observability check failed: prometheus missing api target" >&2
  exit 1
fi

if ! grep -Fq "worker:3001" infra/observability/prometheus.yml; then
  echo "stage14 observability check failed: prometheus missing worker target" >&2
  exit 1
fi

if ! grep -Fq "realtime:3010" infra/observability/prometheus.yml; then
  echo "stage14 observability check failed: prometheus missing realtime target" >&2
  exit 1
fi

if ! grep -Fq "(api|worker|realtime)" infra/observability/promtail-config.yml; then
  echo "stage14 observability check failed: promtail missing api/worker/realtime keep filter" >&2
  exit 1
fi

if ! grep -Fq "@Get('metrics')" apps/api/src/modules/metrics/metrics.controller.ts; then
  echo "stage14 observability check failed: api metrics endpoint missing" >&2
  exit 1
fi

if ! grep -Fq "@Get('metrics')" apps/worker/src/modules/metrics/metrics.controller.ts; then
  echo "stage14 observability check failed: worker metrics endpoint missing" >&2
  exit 1
fi

if ! grep -Fq "req.url === '/metrics'" apps/realtime/server.mjs; then
  echo "stage14 observability check failed: realtime metrics endpoint missing" >&2
  exit 1
fi

echo "stage14 observability checks passed"
