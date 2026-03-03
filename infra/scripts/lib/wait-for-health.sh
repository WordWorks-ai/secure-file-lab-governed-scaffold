#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "usage: $0 <compose-file> <service> <timeout-seconds>" >&2
  exit 1
fi

COMPOSE_FILE="$1"
SERVICE="$2"
TIMEOUT_SECONDS="$3"

start_ts="$(date +%s)"

while true; do
  container_id="$(docker compose -f "$COMPOSE_FILE" ps -q "$SERVICE")"

  if [[ -n "$container_id" ]]; then
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"

    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      echo "service $SERVICE is $status"
      exit 0
    fi
  fi

  now_ts="$(date +%s)"
  elapsed="$((now_ts - start_ts))"

  if (( elapsed >= TIMEOUT_SECONDS )); then
    echo "timeout waiting for $SERVICE to become healthy/running" >&2
    docker compose -f "$COMPOSE_FILE" ps
    exit 1
  fi

  sleep 2
done
