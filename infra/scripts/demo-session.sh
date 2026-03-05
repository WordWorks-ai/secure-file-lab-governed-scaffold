#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/docker-compose.yml}"
ENV_LIB="$ROOT_DIR/infra/scripts/lib/env.sh"
TMP_DIR="$(mktemp -d)"
STAGE_FILE="$TMP_DIR/stages.tsv"

trap 'rm -rf "$TMP_DIR"' EXIT

REQUEST_BODY_FILE="$TMP_DIR/response-body.txt"
REQUEST_HEADERS_FILE="$TMP_DIR/response-headers.txt"
REQUEST_STATUS_CODE=""

DEMO_MODE="${DEMO_MODE:-full}"
REPORT_DIR="${DEMO_REPORT_DIR:-$ROOT_DIR/artifacts/demo}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_START_ISO=""
RUN_END_ISO=""
RUN_START_MS=""
RUN_END_MS=""
TOTAL_DURATION_MS=""
SUMMARY_JSON_FILE=""
SUMMARY_MD_FILE=""

DEMO_FILE_ID=""
DEMO_SHARE_ID=""
DEMO_AUDIT_EVENT_COUNT="0"
DEMO_QUALITY_CHECKS_RUN="0"
DEMO_BACKUP_FLOW_ENABLED="false"
DEMO_NORMALIZED_ADMIN_EMAIL=""

STAGE_COUNT=0

fail() {
  echo "[demo] $1" >&2
  exit 1
}

log() {
  echo "[demo] $1"
}

usage() {
  cat <<USAGE
Usage: ./infra/scripts/demo-session.sh [--mode exec|tech|full] [--report-dir DIR]

Options:
  --mode MODE        Demo mode:
                     exec = platform + health + API storyline
                     tech = exec + scaffold/hardening checks
                     full = tech + backup/restore smoke flow (default)
  --report-dir DIR   Output directory for JSON/Markdown report artifacts.
                     Default: artifacts/demo
  -h, --help         Show this help text.

Environment overrides:
  DEMO_MODE, DEMO_REPORT_DIR, DEMO_BASE_URL, DEMO_ADMIN_EMAIL,
  DEMO_ADMIN_PASSWORD, DEMO_SHARE_PASSWORD, DEMO_USER_AGENT
USAGE
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mode)
        [[ $# -ge 2 ]] || fail "--mode requires a value (exec|tech|full)"
        DEMO_MODE="$2"
        shift 2
        ;;
      --mode=*)
        DEMO_MODE="${1#*=}"
        shift
        ;;
      --report-dir)
        [[ $# -ge 2 ]] || fail "--report-dir requires a path"
        REPORT_DIR="$2"
        shift 2
        ;;
      --report-dir=*)
        REPORT_DIR="${1#*=}"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "unknown argument: $1"
        ;;
    esac
  done

  DEMO_MODE="$(printf '%s' "$DEMO_MODE" | tr '[:upper:]' '[:lower:]')"
  case "$DEMO_MODE" in
    exec|tech|full) ;;
    *)
      fail "invalid --mode '$DEMO_MODE' (expected exec, tech, or full)"
      ;;
  esac
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

now_ms() {
  node -e 'process.stdout.write(String(Date.now()))'
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

ensure_demo_schema_compat() {
  log "Ensuring demo schema compatibility tables exist"
  cat <<'SQL' | docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS file_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL UNIQUE REFERENCES files(id) ON DELETE CASCADE,
  preview_text TEXT,
  preview_generated_at TIMESTAMPTZ,
  ocr_text TEXT,
  ocr_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS file_artifacts_updated_at_idx ON file_artifacts(updated_at);

CREATE TABLE IF NOT EXISTS user_mfa_totp_factors (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_envelope TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  label TEXT,
  public_key TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_webauthn_credentials_user_id_idx ON user_webauthn_credentials(user_id);
CREATE INDEX IF NOT EXISTS user_webauthn_credentials_last_used_at_idx ON user_webauthn_credentials(last_used_at);
SQL
}

run_stage() {
  local stage_id="$1"
  local stage_title="$2"
  local stage_proof="$3"
  shift 3

  local started_ms ended_ms elapsed_ms
  STAGE_COUNT=$((STAGE_COUNT + 1))

  log ""
  log "Stage ${STAGE_COUNT}: ${stage_title}"
  log "----------------------------------------"

  started_ms="$(now_ms)"
  "$@"
  ended_ms="$(now_ms)"
  elapsed_ms="$((ended_ms - started_ms))"

  printf '%s\t%s\t%s\t%s\n' "$stage_id" "$stage_title" "$elapsed_ms" "$stage_proof" >> "$STAGE_FILE"

  log "PASS ${stage_id} (${elapsed_ms}ms)"
  log "Proof point: ${stage_proof}"
}

stage_platform_bootstrap() {
  log "Starting platform"
  make up

  log "Applying database migrations"
  COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/infra/scripts/apply-prisma-migrations.sh"

  log "Generating deterministic Argon2id admin hash for bootstrap"
  raw_hash_output="$(
    docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" exec -T api \
      pnpm --filter @sfl/api hash:password -- "$DEMO_ADMIN_PASSWORD"
  )"
  BOOTSTRAP_ADMIN_PASSWORD_HASH="$(printf '%s\n' "$raw_hash_output" | grep '^\$argon2id\$' | tail -n1 || true)"
  assert_not_empty "$BOOTSTRAP_ADMIN_PASSWORD_HASH" "generated Argon2id hash"
  export BOOTSTRAP_ADMIN_EMAIL="$DEMO_ADMIN_EMAIL"
  export BOOTSTRAP_ADMIN_PASSWORD_HASH

  if schema_is_initialized; then
    log "Existing database schema detected; running idempotent init steps"
    docker compose -f "$COMPOSE_FILE" --env-file "$ROOT_DIR/.env" --profile bootstrap run --rm minio_init
    COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/infra/scripts/vault-init.sh"
    COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/infra/scripts/seed-admin.sh"
  else
    log "Running deterministic bootstrap"
    make bootstrap
  fi

  ensure_demo_schema_compat
}

stage_health_validation() {
  log "Verifying service health"
  ./infra/scripts/health.sh
}

stage_api_storyline() {
  local normalized_admin_email demo_plaintext demo_content_base64
  local login_payload access_token refresh_token upload_payload
  local file_id downloaded_plaintext share_expires_at create_share_payload
  local share_id share_token access_share_payload shared_plaintext
  local refresh_payload rotated_refresh_token logout_payload

  log "Exercising auth, file, share, audit, and token-rotation APIs"
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
  DEMO_AUDIT_EVENT_COUNT="$(json_eval "$REQUEST_BODY_FILE" "data.count")"

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

  DEMO_NORMALIZED_ADMIN_EMAIL="$normalized_admin_email"
  DEMO_FILE_ID="$file_id"
  DEMO_SHARE_ID="$share_id"
}

stage_scaffold_and_hardening_checks() {
  log "Running scaffold and hardening checks"
  bash infra/scripts/tests/phase0-structure.sh
  bash infra/scripts/tests/phase1-compose.sh
  bash infra/scripts/tests/hardening-baseline.sh
  DEMO_QUALITY_CHECKS_RUN="3"
}

stage_backup_restore_smoke() {
  log "Running backup + restore smoke checks"
  bash infra/scripts/tests/backup-restore-guards.sh
  ./infra/scripts/backup.sh
  ./infra/scripts/restore-smoke.sh
  DEMO_BACKUP_FLOW_ENABLED="true"
}

print_scorecard() {
  local aggregate_ms=0
  local stage_line

  log ""
  log "Timing scorecard"
  log "----------------------------------------"
  while IFS=$'\t' read -r stage_id stage_title stage_duration stage_proof; do
    [[ -n "$stage_id" ]] || continue
    aggregate_ms=$((aggregate_ms + stage_duration))
    log "${stage_id}: ${stage_title} -> ${stage_duration}ms"
    log "proof: ${stage_proof}"
  done < "$STAGE_FILE"

  log "Measured stage runtime total: ${aggregate_ms}ms"
}

write_reports() {
  mkdir -p "$REPORT_DIR"

  local basename="demo-${RUN_ID}-${DEMO_MODE}"
  SUMMARY_JSON_FILE="$REPORT_DIR/${basename}.json"
  SUMMARY_MD_FILE="$REPORT_DIR/${basename}.md"

  node - "$STAGE_FILE" "$SUMMARY_JSON_FILE" "$SUMMARY_MD_FILE" "$RUN_ID" "$DEMO_MODE" "$RUN_START_ISO" "$RUN_END_ISO" "$TOTAL_DURATION_MS" "$BASE_URL" "$DEMO_NORMALIZED_ADMIN_EMAIL" "$DEMO_FILE_ID" "$DEMO_SHARE_ID" "$DEMO_AUDIT_EVENT_COUNT" "$DEMO_QUALITY_CHECKS_RUN" "$DEMO_BACKUP_FLOW_ENABLED" <<'NODE'
const fs = require('node:fs');

const [
  ,
  ,
  stageFile,
  jsonPath,
  mdPath,
  runId,
  mode,
  startedAt,
  endedAt,
  totalDurationMs,
  baseUrl,
  adminEmail,
  fileId,
  shareId,
  auditEventCount,
  qualityChecksRun,
  backupFlowEnabled
] = process.argv;

const rawLines = fs.existsSync(stageFile)
  ? fs.readFileSync(stageFile, 'utf8').split(/\r?\n/).filter(Boolean)
  : [];

const stages = rawLines.map((line) => {
  const [id, title, durationMs, proof] = line.split('\t');
  return {
    id,
    title,
    durationMs: Number(durationMs),
    proof
  };
});

const summary = {
  runId,
  mode,
  status: 'pass',
  startedAt,
  endedAt,
  totalDurationMs: Number(totalDurationMs),
  apiBaseUrl: baseUrl,
  stages,
  metrics: {
    stageCount: stages.length,
    stagePassRatePercent: stages.length === 0 ? 0 : 100,
    qualityChecksRun: Number(qualityChecksRun),
    backupRestoreFlowExercised: backupFlowEnabled === 'true',
    auditShareEventCount: Number(auditEventCount),
    adminEmail,
    fileId,
    shareId
  }
};

const stageRows = stages
  .map((stage) => `| ${stage.id} | ${stage.title} | ${stage.durationMs} | ${stage.proof} |`)
  .join('\n');

const markdown = [
  '# Demo Session Report',
  '',
  `- Run ID: ${runId}`,
  `- Mode: ${mode}`,
  `- Status: PASS`,
  `- Started (UTC): ${startedAt}`,
  `- Ended (UTC): ${endedAt}`,
  `- Total Duration (ms): ${totalDurationMs}`,
  `- API Base URL: ${baseUrl}`,
  `- Stages Executed: ${stages.length}`,
  `- Quality Checks Run: ${qualityChecksRun}`,
  `- Backup/Restore Flow Exercised: ${backupFlowEnabled}`,
  `- Share Audit Events Observed: ${auditEventCount}`,
  '',
  '## Stage Timing',
  '',
  '| Stage ID | Stage | Duration (ms) | Proof Point |',
  '| --- | --- | ---: | --- |',
  stageRows || '| n/a | n/a | 0 | no stage data |',
  ''
].join('\n');

fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(mdPath, `${markdown}\n`);
NODE

  cp "$SUMMARY_JSON_FILE" "$REPORT_DIR/latest.json"
  cp "$SUMMARY_MD_FILE" "$REPORT_DIR/latest.md"

  log "Report JSON: $SUMMARY_JSON_FILE"
  log "Report MD:   $SUMMARY_MD_FILE"
  log "Latest JSON: $REPORT_DIR/latest.json"
  log "Latest MD:   $REPORT_DIR/latest.md"
}

main() {
  : > "$STAGE_FILE"
  parse_args "$@"

  if [[ ! -f "$ROOT_DIR/.env" ]]; then
    fail ".env not found. Copy .env.example to .env before running demo."
  fi

  source "$ENV_LIB"
  load_env_file "$ROOT_DIR/.env"

  DEMO_ADMIN_EMAIL="${DEMO_ADMIN_EMAIL:-${BOOTSTRAP_ADMIN_EMAIL:-admin@local.test}}"
  DEMO_ADMIN_PASSWORD="${DEMO_ADMIN_PASSWORD:-demo-session-admin-password}"
  DEMO_SHARE_PASSWORD="${DEMO_SHARE_PASSWORD:-super-secret-password}"
  DEMO_USER_AGENT="${DEMO_USER_AGENT:-sfl-demo-session/2.0}"
  BASE_URL="${DEMO_BASE_URL:-https://localhost:${CADDY_HTTPS_PORT:-8443}/v1}"

  for cmd in make docker curl node; do
    require_command "$cmd"
  done

  RUN_START_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  RUN_START_MS="$(now_ms)"

  log "Demo mode selected: $DEMO_MODE"
  log "Report directory: $REPORT_DIR"

  run_stage \
    "platform" \
    "Platform startup and bootstrap" \
    "Compose stack running and bootstrap path completed." \
    stage_platform_bootstrap

  run_stage \
    "health" \
    "Service health validation" \
    "All core services returned healthy status." \
    stage_health_validation

  run_stage \
    "api" \
    "End-to-end API storyline" \
    "Auth, file lifecycle, share controls, audit analytics, refresh rotation, and logout checks passed." \
    stage_api_storyline

  if [[ "$DEMO_MODE" == "tech" || "$DEMO_MODE" == "full" ]]; then
    run_stage \
      "quality" \
      "Scaffold and hardening checks" \
      "Structure, compose, and hardening baseline checks passed." \
      stage_scaffold_and_hardening_checks
  fi

  if [[ "$DEMO_MODE" == "full" ]]; then
    run_stage \
      "backup" \
      "Backup and restore smoke" \
      "Backup guards, backup artifact generation, and restore smoke flow passed." \
      stage_backup_restore_smoke
  fi

  RUN_END_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  RUN_END_MS="$(now_ms)"
  TOTAL_DURATION_MS="$((RUN_END_MS - RUN_START_MS))"

  print_scorecard
  write_reports

  log ""
  log "Demo validation complete (${TOTAL_DURATION_MS}ms total, mode=${DEMO_MODE})"
}

main "$@"
