#!/usr/bin/env bash
set -euo pipefail

compose_services="$(docker compose --env-file .env.example -f infra/compose/docker-compose.yml --profile enterprise config --services)"

required_services=(
  "keycloak"
  "opa"
)

for service in "${required_services[@]}"; do
  if ! grep -qx "$service" <<<"$compose_services"; then
    echo "stage10 policy check failed: missing compose service $service" >&2
    exit 1
  fi
done

required_env_markers=(
  "KEYCLOAK_SSO_ENABLED="
  "KEYCLOAK_BASE_URL="
  "KEYCLOAK_REALM="
  "OPA_BASE_URL="
  "OPA_POLICY_PATH="
  "POLICY_ENGINE_ENABLED="
  "POLICY_ENGINE_FAIL_SAFE_DENY="
)

for marker in "${required_env_markers[@]}"; do
  if ! grep -Fq "$marker" .env.example; then
    echo "stage10 policy check failed: missing env marker $marker" >&2
    exit 1
  fi
done

if [[ ! -f infra/opa/policy.rego ]]; then
  echo "stage10 policy check failed: missing infra/opa/policy.rego" >&2
  exit 1
fi

required_policy_markers=(
  "default allow = false"
  "allowed_user_action[\"file.upload\"]"
  "allowed_user_action[\"share.create\"]"
)

for marker in "${required_policy_markers[@]}"; do
  if ! grep -Fq "$marker" infra/opa/policy.rego; then
    echo "stage10 policy check failed: missing policy marker $marker" >&2
    exit 1
  fi
done

if ! grep -Fq "@Post('sso/exchange')" apps/api/src/modules/auth/auth.controller.ts; then
  echo "stage10 policy check failed: missing auth sso exchange endpoint" >&2
  exit 1
fi

if ! grep -Fq "PolicyService" apps/api/src/modules/files/files.service.ts; then
  echo "stage10 policy check failed: files service is not policy-gated" >&2
  exit 1
fi

if ! grep -Fq "PolicyService" apps/api/src/modules/shares/shares.service.ts; then
  echo "stage10 policy check failed: shares service is not policy-gated" >&2
  exit 1
fi

echo "stage10 policy checks passed"
