#!/usr/bin/env bash
set -euo pipefail

for marker in \
  "MFA_TOTP_ISSUER=" \
  "MFA_TOTP_SECRET_KEY=" \
  "MFA_WEBAUTHN_RP_ID=" \
  "MFA_WEBAUTHN_RP_NAME=" \
  "MFA_WEBAUTHN_CHALLENGE_TTL_SECONDS="; do
  if ! grep -Fq "$marker" .env.example; then
    echo "stage16 mfa check failed: missing env marker $marker" >&2
    exit 1
  fi
done

for file in \
  "apps/api/src/modules/auth/mfa.service.ts" \
  "apps/api/src/modules/auth/dto/verify-totp.dto.ts" \
  "apps/api/src/modules/auth/dto/webauthn-register-verify.dto.ts" \
  "apps/api/prisma/migrations/20260304193000_phase16_mfa/migration.sql"; do
  if [[ ! -f "$file" ]]; then
    echo "stage16 mfa check failed: missing file $file" >&2
    exit 1
  fi
done

for marker in \
  "@Get('mfa/status')" \
  "@Post('mfa/totp/enroll')" \
  "@Post('mfa/totp/verify')" \
  "@Delete('mfa/totp')" \
  "@Post('mfa/webauthn/register/options')" \
  "@Post('mfa/webauthn/register/verify')"; do
  if ! grep -Fq "$marker" apps/api/src/modules/auth/auth.controller.ts; then
    echo "stage16 mfa check failed: missing auth controller marker $marker" >&2
    exit 1
  fi
done

if ! grep -Fq "totpCode" apps/api/src/modules/auth/dto/login.dto.ts; then
  echo "stage16 mfa check failed: login dto missing totpCode" >&2
  exit 1
fi

if ! grep -Fq "webauthnChallengeToken" apps/api/src/modules/auth/dto/login.dto.ts; then
  echo "stage16 mfa check failed: login dto missing webauthnChallengeToken" >&2
  exit 1
fi

if ! grep -Fq "webauthnCredentialId" apps/api/src/modules/auth/dto/login.dto.ts; then
  echo "stage16 mfa check failed: login dto missing webauthnCredentialId" >&2
  exit 1
fi

if ! grep -Fq "enrolls TOTP MFA" apps/api/test/auth.e2e.test.ts; then
  echo "stage16 mfa check failed: auth e2e TOTP test marker missing" >&2
  exit 1
fi

if ! grep -Fq "registers WebAuthn credential" apps/api/test/auth.e2e.test.ts; then
  echo "stage16 mfa check failed: auth e2e WebAuthn test marker missing" >&2
  exit 1
fi

echo "stage16 mfa checks passed"
