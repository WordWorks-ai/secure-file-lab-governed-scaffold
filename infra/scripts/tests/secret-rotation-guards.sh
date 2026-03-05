#!/usr/bin/env bash
set -euo pipefail

script_path="infra/scripts/rotate-secrets.sh"

if [[ ! -f "$script_path" ]]; then
  echo "secret rotation guard failed: missing script $script_path" >&2
  exit 1
fi

if [[ ! -x "$script_path" ]]; then
  echo "secret rotation guard failed: script is not executable" >&2
  exit 1
fi

for marker in \
  "ROTATE_CONFIRM=YES" \
  "JWT_ACCESS_SECRET" \
  "JWT_REFRESH_SECRET" \
  "MFA_TOTP_SECRET_KEY" \
  "ROTATE_VAULT_TRANSIT" \
  'transit/keys/$VAULT_TRANSIT_KEY_NAME/rotate'; do
  if ! grep -Fq "$marker" "$script_path"; then
    echo "secret rotation guard failed: missing script marker $marker" >&2
    exit 1
  fi
done

if ! grep -Fq "infra/scripts/rotate-secrets.sh" README.md; then
  echo "secret rotation guard failed: README command reference missing" >&2
  exit 1
fi

if ! grep -Fq "infra/scripts/verify-audit-chain.sh" README.md; then
  echo "secret rotation guard failed: README audit-chain command reference missing" >&2
  exit 1
fi

echo "secret rotation guard checks passed"
