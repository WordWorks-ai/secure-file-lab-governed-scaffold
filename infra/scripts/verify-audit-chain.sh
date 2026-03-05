#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/compose/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
ENV_LIB="$ROOT_DIR/infra/scripts/lib/env.sh"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file not found: $ENV_FILE" >&2
  exit 1
fi

source "$ENV_LIB"
load_env_file "$ENV_FILE"

required_vars=(
  POSTGRES_USER
  POSTGRES_DB
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "required environment variable is missing: ${var_name}" >&2
    exit 1
  fi
done

rows_file="$(mktemp)"
trap 'rm -f "$rows_file"' EXIT

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "
    SELECT json_build_object(
      'id', id::text,
      'createdAt', created_at,
      'action', action,
      'resourceType', resource_type,
      'result', result::text,
      'actorType', actor_type::text,
      'actorUserId', actor_user_id::text,
      'orgId', org_id::text,
      'resourceId', resource_id,
      'ipAddress', ip_address,
      'userAgent', user_agent,
      'metadataJson', metadata_json,
      'prevEventHash', prev_event_hash,
      'eventHash', event_hash,
      'chainVersion', chain_version
    )::text
    FROM audit_events
    ORDER BY created_at ASC, id ASC;
  " >"$rows_file"

node - "$rows_file" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');

const rowsPath = process.argv[2];
const raw = fs.readFileSync(rowsPath, 'utf8');
const lines = raw
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const rows = lines.map((line, index) => {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`failed to parse row ${index + 1}: ${error instanceof Error ? error.message : 'unknown'}`);
  }
});

const normalizeJson = (value) => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJson(entry));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }

  const normalized = {};
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
    normalized[key] = normalizeJson(value[key]);
  }
  return normalized;
};

const computeHash = (row) =>
  crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        id: row.id,
        chainVersion: row.chainVersion,
        prevEventHash: row.prevEventHash ?? null,
        createdAt: new Date(row.createdAt).toISOString(),
        action: row.action,
        resourceType: row.resourceType,
        result: row.result,
        actorType: row.actorType,
        actorUserId: row.actorUserId ?? null,
        orgId: row.orgId ?? null,
        resourceId: row.resourceId ?? null,
        ipAddress: row.ipAddress ?? null,
        userAgent: row.userAgent ?? null,
        metadataJson: normalizeJson(row.metadataJson ?? {}),
      }),
      'utf8',
    )
    .digest('hex');

let previousHash = null;
let hashedCount = 0;
let legacyCount = 0;
let hasSeenHashedEvent = false;
const errors = [];

for (const [index, row] of rows.entries()) {
  const line = index + 1;
  const eventHash = row.eventHash ?? null;
  const prevEventHash = row.prevEventHash ?? null;

  if (!eventHash) {
    legacyCount += 1;
    if (hasSeenHashedEvent) {
      errors.push(`row ${line} (${row.id}): unchained legacy event appears after chained events`);
    }
    continue;
  }

  hasSeenHashedEvent = true;
  hashedCount += 1;

  if (row.chainVersion !== 'sha256-v1') {
    errors.push(`row ${line} (${row.id}): unsupported chainVersion ${String(row.chainVersion)}`);
  }
  if (prevEventHash !== previousHash) {
    errors.push(
      `row ${line} (${row.id}): prevEventHash mismatch expected=${previousHash ?? 'null'} actual=${prevEventHash ?? 'null'}`,
    );
  }

  const expectedHash = computeHash(row);
  if (expectedHash !== eventHash) {
    errors.push(`row ${line} (${row.id}): eventHash mismatch expected=${expectedHash} actual=${eventHash}`);
  }

  previousHash = eventHash;
}

if (errors.length > 0) {
  console.error('audit chain verification failed');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

if (hashedCount === 0) {
  console.log(`audit chain verification passed: no chained events present (legacyEvents=${legacyCount})`);
  process.exit(0);
}

console.log(
  `audit chain verification passed: hashedEvents=${hashedCount} legacyEvents=${legacyCount} tipHash=${previousHash}`,
);
NODE
