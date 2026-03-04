#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PNPM_CLI_JS="${PNPM_CLI_JS:-}"

if [[ -n "$PNPM_CLI_JS" ]]; then
  pnpm_cmd=(node "$PNPM_CLI_JS")
else
  pnpm_cmd=(pnpm)
fi

if [[ -z "$PNPM_CLI_JS" ]] && ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required for dependency audit checks" >&2
  exit 1
fi

if [[ ! -f "$ROOT_DIR/pnpm-lock.yaml" ]]; then
  echo "pnpm-lock.yaml is required for dependency audit checks" >&2
  exit 1
fi

cd "$ROOT_DIR"

audit_output="$(mktemp)"
trap 'rm -f "$audit_output"' EXIT

set +e
"${pnpm_cmd[@]}" audit --audit-level high >"$audit_output" 2>&1
audit_exit_code=$?
set -e

if [[ "$audit_exit_code" -ne 0 ]]; then
  if rg -n 'ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|503 Service Unavailable|429 Too Many Requests' "$audit_output" >/dev/null 2>&1; then
    echo "dependency audit failed due advisory service/network error" >&2
    cat "$audit_output" >&2
    exit 1
  fi

  cat "$audit_output" >&2
  echo "dependency audit found vulnerabilities at high severity or above" >&2
  exit "$audit_exit_code"
fi

echo "dependency audit checks passed"
