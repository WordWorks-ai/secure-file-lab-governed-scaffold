#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_LIB="$ROOT_DIR/infra/scripts/lib/env.sh"

if [[ ! -f "$ENV_LIB" ]]; then
  echo "env loader library missing: $ENV_LIB" >&2
  exit 1
fi

source "$ENV_LIB"

tmp_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root"' EXIT

owned_file="$tmp_root/owned"

cat >"$tmp_root/safe.env" <<EOF
SAFE_KEY=value
DANGEROUS_ONE=\$(touch "$owned_file")
DANGEROUS_TWO=\`touch "$owned_file.two"\`
INLINE_COMMENT=keep # ignored comment
URL_VALUE=https://example.com/path#anchor
QUOTED_VALUE="space value"
SINGLE_QUOTED='single value'
EOF

load_env_file "$tmp_root/safe.env"

if [[ "$SAFE_KEY" != "value" ]]; then
  echo "SAFE_KEY value mismatch" >&2
  exit 1
fi

if [[ "$DANGEROUS_ONE" != "\$(touch \"$owned_file\")" ]]; then
  echo "DANGEROUS_ONE should remain literal text" >&2
  exit 1
fi

if [[ "$DANGEROUS_TWO" != "\`touch \"$owned_file.two\"\`" ]]; then
  echo "DANGEROUS_TWO should remain literal text" >&2
  exit 1
fi

if [[ "$INLINE_COMMENT" != "keep" ]]; then
  echo "INLINE_COMMENT parsing mismatch" >&2
  exit 1
fi

if [[ "$URL_VALUE" != "https://example.com/path#anchor" ]]; then
  echo "URL_VALUE parsing mismatch" >&2
  exit 1
fi

if [[ "$QUOTED_VALUE" != "space value" ]]; then
  echo "QUOTED_VALUE parsing mismatch" >&2
  exit 1
fi

if [[ "$SINGLE_QUOTED" != "single value" ]]; then
  echo "SINGLE_QUOTED parsing mismatch" >&2
  exit 1
fi

if [[ -e "$owned_file" || -e "$owned_file.two" ]]; then
  echo "unsafe env evaluation detected" >&2
  exit 1
fi

echo "BROKEN-LINE" >"$tmp_root/invalid.env"
if load_env_file "$tmp_root/invalid.env" >/dev/null 2>&1; then
  echo "invalid env file should fail parsing" >&2
  exit 1
fi

echo "env loader safety checks passed"
