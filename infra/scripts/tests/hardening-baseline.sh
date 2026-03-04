#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/compose/docker-compose.yml"
CADDY_FILE="$ROOT_DIR/infra/caddy/Caddyfile"
BOOTSTRAP_SCRIPT="$ROOT_DIR/infra/scripts/bootstrap.sh"
SEED_SCRIPT="$ROOT_DIR/infra/scripts/seed-admin.sh"
BACKUP_SCRIPT="$ROOT_DIR/infra/scripts/backup.sh"
RESTORE_SCRIPT="$ROOT_DIR/infra/scripts/restore-smoke.sh"
RESTORE_LIVE_SCRIPT="$ROOT_DIR/infra/scripts/restore-live.sh"
RESET_SCRIPT="$ROOT_DIR/infra/scripts/reset.sh"
DEPENDENCY_AUDIT_SCRIPT="$ROOT_DIR/infra/scripts/tests/dependency-audit.sh"
CONTAINER_BUILD_SCRIPT="$ROOT_DIR/infra/scripts/tests/container-build-validation.sh"
ENV_LIB="$ROOT_DIR/infra/scripts/lib/env.sh"
API_DOCKERFILE="$ROOT_DIR/apps/api/Dockerfile"
WORKER_DOCKERFILE="$ROOT_DIR/apps/worker/Dockerfile"
CI_FILE="$ROOT_DIR/.github/workflows/ci.yml"
LOCKFILE="$ROOT_DIR/pnpm-lock.yaml"

for required_file in \
  "$COMPOSE_FILE" \
  "$CADDY_FILE" \
  "$BOOTSTRAP_SCRIPT" \
  "$SEED_SCRIPT" \
  "$BACKUP_SCRIPT" \
  "$RESTORE_SCRIPT" \
  "$RESTORE_LIVE_SCRIPT" \
  "$RESET_SCRIPT" \
  "$DEPENDENCY_AUDIT_SCRIPT" \
  "$CONTAINER_BUILD_SCRIPT" \
  "$ENV_LIB" \
  "$API_DOCKERFILE" \
  "$WORKER_DOCKERFILE" \
  "$CI_FILE" \
  "$LOCKFILE"; do
  if [[ ! -f "$required_file" ]]; then
    echo "required file missing: $required_file" >&2
    exit 1
  fi
done

service_block() {
  local service_name="$1"
  awk -v service="  ${service_name}:" '
    $0 == service {
      in_block=1
      print $0
      next
    }
    in_block && $0 ~ /^  [a-zA-Z0-9_]+:/ {
      exit
    }
    in_block {
      print $0
    }
  ' "$COMPOSE_FILE"
}

assert_in_block() {
  local block="$1"
  local pattern="$2"
  local label="$3"
  if ! grep -Fq -- "$pattern" <<<"$block"; then
    echo "missing expected pattern ($label): $pattern" >&2
    exit 1
  fi
}

api_block="$(service_block api)"
worker_block="$(service_block worker)"

if [[ -z "$api_block" || -z "$worker_block" ]]; then
  echo "api/worker service blocks not found in compose" >&2
  exit 1
fi

for block_label in api worker; do
  if [[ "$block_label" == "api" ]]; then
    block="$api_block"
  else
    block="$worker_block"
  fi

  assert_in_block "$block" "user: 'node'" "$block_label non-root user"
  assert_in_block "$block" "read_only: true" "$block_label read-only fs"
  assert_in_block "$block" "cap_drop:" "$block_label dropped capabilities"
  assert_in_block "$block" "- ALL" "$block_label drop all caps"
  assert_in_block "$block" "security_opt:" "$block_label security opts"
  assert_in_block "$block" "no-new-privileges:true" "$block_label nnp"
  assert_in_block "$block" "tmpfs:" "$block_label tmpfs"
  assert_in_block "$block" "- /tmp" "$block_label tmp"
  assert_in_block "$block" "COREPACK_HOME: /tmp/corepack" "$block_label corepack cache"
done

for pinned_image in \
  "image: caddy:2.8" \
  "image: postgres:16-alpine" \
  "image: redis:7-alpine" \
  "image: quay.io/minio/minio:RELEASE.2025-02-07T23-21-09Z" \
  "image: hashicorp/vault:1.18" \
  "image: clamav/clamav:1.4" \
  "image: mailhog/mailhog:v1.0.1" \
  "image: alpine:3.20"; do
  if ! grep -Fq "$pinned_image" "$COMPOSE_FILE"; then
    echo "missing or changed pinned image declaration: $pinned_image" >&2
    exit 1
  fi
done

if [[ "$(rg -n 'platform: linux/amd64' "$COMPOSE_FILE" | wc -l | tr -d '[:space:]')" -lt 2 ]]; then
  echo "expected explicit linux/amd64 platform pinning for amd64-only images" >&2
  exit 1
fi

if rg -n 'image: .*:latest$' "$COMPOSE_FILE" >/dev/null; then
  echo "latest image tag detected in compose (not allowed)" >&2
  exit 1
fi

for install_file in "$API_DOCKERFILE" "$WORKER_DOCKERFILE" "$CI_FILE"; do
  if ! rg -n 'pnpm install --frozen-lockfile' "$install_file" >/dev/null; then
    echo "expected frozen lockfile install command missing in $install_file" >&2
    exit 1
  fi
done

if rg -n -- '--no-frozen-lockfile|--frozen-lockfile=false' "$API_DOCKERFILE" "$WORKER_DOCKERFILE" "$CI_FILE" >/dev/null; then
  echo "non-deterministic pnpm install flags detected in docker/ci files" >&2
  exit 1
fi

for ci_expectation in \
  'pnpm test:unit' \
  'pnpm test:integration' \
  'infra/scripts/tests/dependency-audit.sh' \
  'infra/scripts/tests/container-build-validation.sh'; do
  if ! rg -n "$ci_expectation" "$CI_FILE" >/dev/null; then
    echo "ci hardening expectation missing: $ci_expectation" >&2
    exit 1
  fi
done

for header_line in \
  'X-Content-Type-Options "nosniff"' \
  'X-Frame-Options "DENY"' \
  'Referrer-Policy "no-referrer"' \
  'Permissions-Policy "camera=(), microphone=(), geolocation=()"' \
  '-Server'; do
  if ! grep -Fq -- "$header_line" "$CADDY_FILE"; then
    echo "missing caddy hardening header: $header_line" >&2
    exit 1
  fi
done

for caddy_tls_line in \
  'https://localhost' \
  'tls internal'; do
  if ! grep -Fq -- "$caddy_tls_line" "$CADDY_FILE"; then
    echo "missing caddy tls baseline config: $caddy_tls_line" >&2
    exit 1
  fi
done

for vite_tmpfs_path in \
  '/workspace/node_modules/.vite-temp' \
  '/workspace/apps/api/node_modules/.vite-temp' \
  '/workspace/packages/shared/node_modules/.vite-temp'; do
  assert_in_block "$api_block" "$vite_tmpfs_path" "api vite temp tmpfs"
done

for vite_tmpfs_path in \
  '/workspace/node_modules/.vite-temp' \
  '/workspace/apps/worker/node_modules/.vite-temp'; do
  assert_in_block "$worker_block" "$vite_tmpfs_path" "worker vite temp tmpfs"
done

for bootstrap_guard in \
  'BOOTSTRAP_ADMIN_PASSWORD_HASH must be set to a real Argon2id hash' \
  'BOOTSTRAP_ADMIN_PASSWORD_HASH must begin with \$argon2id\$'; do
  if ! grep -Fq "$bootstrap_guard" "$BOOTSTRAP_SCRIPT"; then
    echo "bootstrap guard missing: $bootstrap_guard" >&2
    exit 1
  fi
done

for seed_guard in \
  'BOOTSTRAP_ADMIN_PASSWORD_HASH must begin with \$argon2id\$' \
  ":'admin_password_hash'" \
  ":'admin_email'"; do
  if ! grep -Fq "$seed_guard" "$SEED_SCRIPT"; then
    echo "admin seed hardening control missing: $seed_guard" >&2
    exit 1
  fi
done

for backup_guard in \
  'required environment variable is missing' \
  'SHA256SUMS' \
  '"checksums": "SHA256SUMS"' \
  'BACKUP_ROOT must not resolve to /' \
  'OUT_DIR must remain within BACKUP_ROOT' \
  'RETENTION_COUNT'; do
  if ! grep -Fq "$backup_guard" "$BACKUP_SCRIPT"; then
    echo "backup safety control missing: $backup_guard" >&2
    exit 1
  fi
done

for restore_guard in \
  'backup is missing manifest.json' \
  'backup is missing minio directory' \
  'backup is missing postgres.sql' \
  'shasum -a 256 -c SHA256SUMS'; do
  if ! grep -Fq "$restore_guard" "$RESTORE_SCRIPT"; then
    echo "restore safety control missing: $restore_guard" >&2
    exit 1
  fi
done

for restore_live_guard in \
  'RESTORE_CONFIRM=YES' \
  'BACKUP_ROOT must not resolve to /' \
  'BACKUP_DIR must remain within BACKUP_ROOT' \
  'backup is missing manifest.json'; do
  if ! grep -Fq "$restore_live_guard" "$RESTORE_LIVE_SCRIPT"; then
    echo "restore-live safety control missing: $restore_live_guard" >&2
    exit 1
  fi
done

for reset_guard in \
  'RESET_CONFIRM=YES' \
  'RESET_BACKUP_FIRST' \
  'RESET_DELETE_BACKUPS' \
  'RESET_START_STACK'; do
  if ! grep -Fq "$reset_guard" "$RESET_SCRIPT"; then
    echo "reset safety control missing: $reset_guard" >&2
    exit 1
  fi
done

for env_script in \
  "$BOOTSTRAP_SCRIPT" \
  "$BACKUP_SCRIPT" \
  "$RESTORE_SCRIPT" \
  "$RESTORE_LIVE_SCRIPT" \
  "$RESET_SCRIPT" \
  "$ROOT_DIR/infra/scripts/health.sh" \
  "$ROOT_DIR/infra/scripts/tests/ops-reproducibility.sh"; do
  if ! rg -n 'load_env_file' "$env_script" >/dev/null; then
    echo "safe env loader not used in $env_script" >&2
    exit 1
  fi
done

if rg -n --glob '!infra/scripts/tests/hardening-baseline.sh' 'source[[:space:]]+.+\.env' "$ROOT_DIR/infra/scripts" >/dev/null; then
  echo "direct .env sourcing detected under infra/scripts" >&2
  exit 1
fi

echo "hardening baseline checks passed"
