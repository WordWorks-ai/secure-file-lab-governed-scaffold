#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

if [[ -f "$ROOT_DIR/.env" ]]; then
  echo ".env file is present locally (expected), verifying it is ignored by git"
  if git -C "$ROOT_DIR" ls-files --error-unmatch .env >/dev/null 2>&1; then
    echo ".env is tracked by git (must not happen)" >&2
    exit 1
  fi
fi

# simple baseline scan for accidentally committed private keys or obvious secrets.
if rg -n --hidden --glob '!.git/**' --glob '!.env' --glob '!backups/**' --glob '!infra/scripts/tests/secrets-hygiene.sh' \
  '(BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY|AKIA[0-9A-Z]{16}|xox[baprs]-|ghp_[A-Za-z0-9]{36}|-----BEGIN)' "$ROOT_DIR" >/dev/null; then
  echo "potential hardcoded secret material detected" >&2
  exit 1
fi

# enforce docker build context hygiene for local secret files.
if [[ ! -f "$ROOT_DIR/.dockerignore" ]]; then
  echo ".dockerignore is required" >&2
  exit 1
fi

if ! rg -n '^\.env$' "$ROOT_DIR/.dockerignore" >/dev/null; then
  echo ".dockerignore must exclude .env" >&2
  exit 1
fi

# verify hard-coded fallback secrets have been removed from source
FALLBACK_PATTERNS='local-dev-insecure-access-secret|dev-mfa-secret'
if rg -n --hidden --glob '!.git/**' --glob '!.env' --glob '!infra/scripts/tests/secrets-hygiene.sh' \
  --glob '!docs/**' --glob '!*.md' \
  "$FALLBACK_PATTERNS" "$ROOT_DIR" >/dev/null 2>&1; then
  echo "hard-coded fallback secrets still present in source (must be removed)" >&2
  exit 1
fi

echo "secrets hygiene checks passed"
