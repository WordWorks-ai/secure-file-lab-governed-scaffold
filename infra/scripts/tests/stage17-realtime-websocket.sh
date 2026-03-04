#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f apps/realtime/server.mjs ]]; then
  echo "stage17 realtime websocket check failed: missing realtime server" >&2
  exit 1
fi

if [[ ! -f apps/realtime/test/websocket-auth-delivery.test.mjs ]]; then
  echo "stage17 realtime websocket check failed: missing realtime websocket test" >&2
  exit 1
fi

for marker in \
  "REALTIME_AUTH_REQUIRED="; do
  if ! grep -Fq "$marker" .env.example; then
    echo "stage17 realtime websocket check failed: missing env marker $marker" >&2
    exit 1
  fi
done

for marker in \
  "server.on('upgrade'" \
  "requestUrl.pathname !== '/ws'" \
  "verifyJwtAccessToken" \
  "sfl_realtime_ws_connected_clients"; do
  if ! grep -Fq "$marker" apps/realtime/server.mjs; then
    echo "stage17 realtime websocket check failed: missing marker $marker" >&2
    exit 1
  fi
done

if ! grep -Fq "REALTIME_AUTH_REQUIRED: \${REALTIME_AUTH_REQUIRED:-true}" infra/compose/docker-compose.yml; then
  echo "stage17 realtime websocket check failed: realtime compose env missing REALTIME_AUTH_REQUIRED" >&2
  exit 1
fi

if ! grep -Fq "JWT_ACCESS_SECRET: \${JWT_ACCESS_SECRET}" infra/compose/docker-compose.yml; then
  echo "stage17 realtime websocket check failed: realtime compose env missing JWT_ACCESS_SECRET pass-through" >&2
  exit 1
fi

node --test apps/realtime/test/websocket-auth-delivery.test.mjs

echo "stage17 realtime websocket checks passed"
