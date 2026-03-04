#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/docker-compose.yml}"
ENV_LIB="$ROOT_DIR/infra/scripts/lib/env.sh"
TMP_DIR="$(mktemp -d)"

trap 'rm -rf "$TMP_DIR"' EXIT

REQUEST_BODY_FILE="$TMP_DIR/response-body.txt"
REQUEST_HEADERS_FILE="$TMP_DIR/response-headers.txt"
REQUEST_STATUS_CODE=""

fail() {
  echo "[demo] $1" >&2
  exit 1
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "required command not found: $command_name"
  fi
}

assert_equals() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label mismatch (expected '$expected', got '$actual')"
  fi
}

assert_not_empty() {
  local value="$1"
  local label="$2"
  if [[ -z "$value" ]]; then
    fail "$label must not be empty"
  fi
}

http_request() {
  local expected_status="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local access_token="${5:-}"
  local accept="${6:-application/json}"
  local url="${BASE_URL}${path}"

  rm -f "$REQUEST_BODY_FILE" "$REQUEST_HEADERS_FILE"
  local -a curl_args=(
    -sS
    -k
    -X "$method"
    -H "Accept: $accept"
    -H "User-Agent: $DEMO_USER_AGENT"
    -D "$REQUEST_HEADERS_FILE"
    -o "$REQUEST_BODY_FILE"
    -w "%{http_code}"
  )

  if [[ -n "$access_token" ]]; then
    curl_args+=(-H "Authorization: Bearer $access_token")
  fi

  if [[ -n "$body" ]]; then
    curl_args+=(-H "Content-Type: application/json" --data "$body")
  fi

  REQUEST_STATUS_CODE="$(curl "${curl_args[@]}" "$url")"
  if [[ "$REQUEST_STATUS_CODE" != "$expected_status" ]]; then
    {
      echo "[demo] unexpected status for $method $path (expected $expected_status, got $REQUEST_STATUS_CODE)"
      echo "[demo] response headers:"
      cat "$REQUEST_HEADERS_FILE"
      echo "[demo] response body:"
      cat "$REQUEST_BODY_FILE"
    } >&2
    exit 1
  fi
}

json_eval() {
  local json_file="$1"
  local expression="$2"
  node - "$json_file" "$expression" <<'NODE'
const fs = require('node:fs');

const [, , jsonFile, expression] = process.argv;
let data;
try {
  data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
} catch (error) {
  console.error(`failed to parse JSON from ${jsonFile}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

let value;
try {
  value = Function('data', `"use strict"; return (${expression});`)(data);
} catch (error) {
  console.error(`failed to evaluate expression "${expression}": ${error instanceof Error ? error.message : String(error)}`);
  process.exit(3);
}

if (value === undefined || value === null) {
  process.exit(4);
}

if (typeof value === 'object') {
  process.stdout.write(JSON.stringify(value));
} else {
  process.stdout.write(String(value));
}
NODE
}

json_assert() {
  local json_file="$1"
  local expression="$2"
  local label="$3"

  if ! node - "$json_file" "$expression" <<'NODE'
const fs = require('node:fs');

const [, , jsonFile, expression] = process.argv;
const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
const passed = Boolean(Function('data', `"use strict"; return (${expression});`)(data));
if (!passed) {
  process.exit(1);
}
NODE
  then
    {
      echo "[demo] assertion failed: $label"
      echo "[demo] expression: $expression"
      echo "[demo] response body:"
      cat "$json_file"
    } >&2
    exit 1
  fi
}

schema_is_initialized() {
  local status
  status="$(
    docker compose -f "$COMPOSE_FILE" exec -T postgres \
      psql -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      -c "SELECT CASE WHEN to_regclass('public.users') IS NOT NULL AND to_regclass('public.orgs') IS NOT NULL AND to_regclass('public.files') IS NOT NULL AND to_regclass('public.shares') IS NOT NULL THEN 'ready' ELSE 'missing' END;" \
      2>/dev/null || true
  )"

  [[ "$status" == "ready" ]]
}

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  fail ".env not found. Copy .env.example to .env before running demo."
fi

source "$ENV_LIB"
load_env_file "$ROOT_DIR/.env"

DEMO_ADMIN_EMAIL="${DEMO_ADMIN_EMAIL:-${BOOTSTRAP_ADMIN_EMAIL:-admin@local.test}}"
DEMO_ADMIN_PASSWORD="${DEMO_ADMIN_PASSWORD:-demo-session-admin-password}"
DEMO_SHARE_PASSWORD="${DEMO_SHARE_PASSWORD:-super-secret-password}"
DEMO_USER_AGENT="${DEMO_USER_AGENT:-sfl-demo-session/1.0}"
BASE_URL="${DEMO_BASE_URL:-https://localhost:${CADDY_HTTPS_PORT:-8443}/v1}"

for cmd in make docker curl node; do
  require_command "$cmd"
done

echo "[demo] Starting platform"
make up

echo "[demo] Generating deterministic Argon2id admin hash for bootstrap"
raw_hash_output="$(
  docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" exec -T api \
    pnpm --filter @sfl/api hash:password -- "$DEMO_ADMIN_PASSWORD"
)"
BOOTSTRAP_ADMIN_PASSWORD_HASH="$(printf '%s\n' "$raw_hash_output" | grep '^\$argon2id\$' | tail -n1 || true)"
assert_not_empty "$BOOTSTRAP_ADMIN_PASSWORD_HASH" "generated Argon2id hash"
export BOOTSTRAP_ADMIN_EMAIL="$DEMO_ADMIN_EMAIL"
export BOOTSTRAP_ADMIN_PASSWORD_HASH

if schema_is_initialized; then
  echo "[demo] Existing database schema detected; running idempotent init steps"
  docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" --profile bootstrap run --rm minio_init
  COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/infra/scripts/vault-init.sh"
  COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/infra/scripts/seed-admin.sh"
else
  echo "[demo] Running deterministic bootstrap"
  make bootstrap
fi

echo "[demo] Verifying service health"
./infra/scripts/health.sh

echo "[demo] Exercising auth, file, share, and audit APIs"
normalized_admin_email="$(printf '%s' "$DEMO_ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]')"
demo_plaintext="Secure File Lab automated demo payload @ $(date -u +%Y-%m-%dT%H:%M:%SZ)"
demo_content_base64="$(node -e "process.stdout.write(Buffer.from(process.argv[1], 'utf8').toString('base64'))" "$demo_plaintext")"

login_payload="$(node -e "process.stdout.write(JSON.stringify({ email: process.argv[1], password: process.argv[2] }))" "$DEMO_ADMIN_EMAIL" "$DEMO_ADMIN_PASSWORD")"
http_request 201 POST "/auth/login" "$login_payload"
json_assert "$REQUEST_BODY_FILE" "data.tokenType === 'Bearer'" "login token type should be Bearer"
access_token="$(json_eval "$REQUEST_BODY_FILE" "data.accessToken")"
refresh_token="$(json_eval "$REQUEST_BODY_FILE" "data.refreshToken")"
assert_not_empty "$access_token" "access token"
assert_not_empty "$refresh_token" "refresh token"

http_request 200 GET "/auth/me" "" "$access_token"
assert_equals "$(json_eval "$REQUEST_BODY_FILE" "data.user.email")" "$normalized_admin_email" "auth.me email"
assert_equals "$(json_eval "$REQUEST_BODY_FILE" "data.user.role")" "admin" "auth.me role"

http_request 200 GET "/auth/admin-check" "" "$access_token"
assert_equals "$(json_eval "$REQUEST_BODY_FILE" "data.allowed")" "true" "admin-check allowed flag"

upload_payload="$(node -e "process.stdout.write(JSON.stringify({ filename: 'demo-note.txt', contentType: 'text/plain', contentBase64: process.argv[1] }))" "$demo_content_base64")"
http_request 201 POST "/files/upload" "$upload_payload" "$access_token"
file_id="$(json_eval "$REQUEST_BODY_FILE" "data.fileId")"
assert_not_empty "$file_id" "file id"
assert_equals "$(json_eval "$REQUEST_BODY_FILE" "data.status")" "scan_pending" "file upload status"

http_request 403 GET "/files/${file_id}/download" "" "$access_token"

http_request 200 POST "/files/${file_id}/activate" "" "$access_token"
assert_equals "$(json_eval "$REQUEST_BODY_FILE" "data.fileId")" "$file_id" "activate file id"
assert_equals "$(json_eval "$REQUEST_BODY_FILE" "data.status")" "active" "activate status"

http_request 200 GET "/files/${file_id}" "" "$access_token"
assert_equals "$(json_eval "$REQUEST_BODY_FILE" "data.id")" "$file_id" "metadata file id"
assert_equals "$(json_eval "$REQUEST_BODY_FILE" "data.status")" "active" "metadata status"

http_request 200 GET "/files/${file_id}/download" "" "$access_token"
downloaded_plaintext="$(
  node -e "process.stdout.write(Buffer.from(process.argv[1], 'base64').toString('utf8'))" \
    "$(json_eval "$REQUEST_BODY_FILE" "data.contentBase64")"
)"
assert_equals "$downloaded_plaintext" "$demo_plaintext" "direct download payload"

share_expires_at="$(node -e "process.stdout.write(new Date(Date.now() + 60 * 60 * 1000).toISOString())")"
create_share_payload="$(
  node -e "process.stdout.write(JSON.stringify({ fileId: process.argv[1], expiresAt: process.argv[2], maxDownloads: 2, password: process.argv[3] }))" \
    "$file_id" "$share_expires_at" "$DEMO_SHARE_PASSWORD"
)"
http_request 201 POST "/shares" "$create_share_payload" "$access_token"
share_id="$(json_eval "$REQUEST_BODY_FILE" "data.shareId")"
share_token="$(json_eval "$REQUEST_BODY_FILE" "data.shareToken")"
assert_not_empty "$share_id" "share id"
assert_not_empty "$share_token" "share token"
assert_equals "$(json_eval "$REQUEST_BODY_FILE" "data.requiresPassword")" "true" "share requiresPassword flag"

access_share_payload="$(node -e "process.stdout.write(JSON.stringify({ shareToken: process.argv[1], password: process.argv[2] }))" "$share_token" "$DEMO_SHARE_PASSWORD")"
http_request 200 POST "/shares/access" "$access_share_payload"
shared_plaintext="$(
  node -e "process.stdout.write(Buffer.from(process.argv[1], 'base64').toString('utf8'))" \
    "$(json_eval "$REQUEST_BODY_FILE" "data.contentBase64")"
)"
assert_equals "$shared_plaintext" "$demo_plaintext" "share access payload"

http_request 200 POST "/shares/${share_id}/revoke" "" "$access_token"
assert_equals "$(json_eval "$REQUEST_BODY_FILE" "data.shareId")" "$share_id" "revoke share id"
http_request 403 POST "/shares/access" "$access_share_payload"

http_request 200 GET "/audit/events?resourceType=share&limit=50" "" "$access_token"
json_assert "$REQUEST_BODY_FILE" "data.count > 0" "audit events should return at least one share event"
json_assert "$REQUEST_BODY_FILE" "Array.isArray(data.events) && data.events.some((event) => event.action === 'share.create')" "audit events should contain share.create"

http_request 200 GET "/audit/events/export?resourceType=share&limit=50" "" "$access_token" "application/x-ndjson"
if ! grep -iq '^content-type: application/x-ndjson' "$REQUEST_HEADERS_FILE"; then
  fail "audit export did not return application/x-ndjson content type"
fi
if ! grep -q '"action":"share.create"' "$REQUEST_BODY_FILE"; then
  fail "audit export does not include share.create event"
fi
node -e "
const fs = require('node:fs');
const lines = fs.readFileSync(process.argv[1], 'utf8').trim().split(/\r?\n/).filter(Boolean);
if (lines.length === 0) process.exit(1);
for (const line of lines) JSON.parse(line);
" "$REQUEST_BODY_FILE" || fail "audit export body is not valid NDJSON"

http_request 200 GET "/audit/events/summary?resourceType=share&limit=50&top=5" "" "$access_token"
json_assert "$REQUEST_BODY_FILE" "data.sampledCount > 0" "audit summary should include sampled events"
json_assert "$REQUEST_BODY_FILE" "data.topCount === 5" "audit summary should honor top=5"
json_assert "$REQUEST_BODY_FILE" "Array.isArray(data.byAction) && data.byAction.some((bucket) => bucket.action === 'share.create')" "audit summary should include share.create bucket"

http_request 200 GET "/audit/events/timeseries?resourceType=share&bucket=hour&limit=50" "" "$access_token"
json_assert "$REQUEST_BODY_FILE" "data.bucket === 'hour'" "audit timeseries bucket should be hour"
json_assert "$REQUEST_BODY_FILE" "Array.isArray(data.points) && data.points.length > 0" "audit timeseries should return points"

http_request 200 GET "/audit/events/kpis?resourceType=share&windowHours=24&limit=200" "" "$access_token"
json_assert "$REQUEST_BODY_FILE" "data.windowHours === 24" "audit KPI window should be 24h"
json_assert "$REQUEST_BODY_FILE" "data.current.sampledCount > 0" "audit KPI current window should have sampled events"
json_assert "$REQUEST_BODY_FILE" "typeof data.deltas.successRate === 'number'" "audit KPI successRate delta should be numeric"

refresh_payload="$(node -e "process.stdout.write(JSON.stringify({ refreshToken: process.argv[1] }))" "$refresh_token")"
http_request 201 POST "/auth/refresh" "$refresh_payload"
rotated_refresh_token="$(json_eval "$REQUEST_BODY_FILE" "data.refreshToken")"
assert_not_empty "$rotated_refresh_token" "rotated refresh token"
if [[ "$rotated_refresh_token" == "$refresh_token" ]]; then
  fail "refresh token was not rotated"
fi

logout_payload="$(node -e "process.stdout.write(JSON.stringify({ refreshToken: process.argv[1] }))" "$rotated_refresh_token")"
http_request 200 POST "/auth/logout" "$logout_payload"
assert_equals "$(json_eval "$REQUEST_BODY_FILE" "data.success")" "true" "logout success"
http_request 401 POST "/auth/refresh" "$logout_payload"

echo "[demo] Running scaffold and hardening checks"
bash infra/scripts/tests/phase0-structure.sh
bash infra/scripts/tests/phase1-compose.sh
bash infra/scripts/tests/hardening-baseline.sh

echo "[demo] Running backup + restore smoke checks"
bash infra/scripts/tests/backup-restore-guards.sh
./infra/scripts/backup.sh
./infra/scripts/restore-smoke.sh

echo "[demo] Demo validation complete"
