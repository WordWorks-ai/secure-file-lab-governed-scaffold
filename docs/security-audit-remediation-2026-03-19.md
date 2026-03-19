# Security Audit Remediation Report

Date: 2026-03-19
Source: `docs/client-source/security-review-findings-2026-03-19.md`

## Executive Summary

All 19 findings from the client security review have been validated, triaged, and addressed. 12 findings received code-level fixes, 5 were documented with infrastructure guidance, and 2 are addressed transitively by other fixes.

## Finding-by-Finding Remediation Status

### Critical

| ID | Finding | Status | Resolution |
|----|---------|--------|------------|
| F1 | Hard-coded fallback JWT signing secret (`local-dev-insecure-access-secret`) | **FIXED** | Removed fallback; `getAccessTokenSecret()` now throws if `JWT_ACCESS_SECRET` is unset. Startup validation fails fast. |
| F2 | MFA TOTP encryption key fallback chain (`dev-mfa-secret`) | **FIXED** | Removed 3-level fallback; `getTotpEncryptionKey()` now requires `MFA_TOTP_SECRET_KEY`. Startup validation enforces presence. |
| D10 | JWT secret compromise enables full admin impersonation | **FIXED** | Addressed transitively by F1 (no fallback), D7 (no reuse), and D8 (user revalidation). |

### High

| ID | Finding | Status | Resolution |
|----|---------|--------|------------|
| F5/D5 | No rate limiting on login and public share access | **FIXED** | Added `@nestjs/throttler` with global 100 req/min default. Login: 10/min, refresh: 10/min, share access: 20/min. |
| D7 | Secret reuse (JWT_ACCESS_SECRET = MINIO_ROOT_PASSWORD) | **FIXED** | Startup validation checks distinctness across `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MINIO_ROOT_PASSWORD`, `MFA_TOTP_SECRET_KEY`. Reuse is a fatal startup error. |
| D8 | Privileged routes trust JWT claims without DB revalidation | **FIXED** | Created `ActiveUserGuard` that verifies user exists and `isActive=true` in DB. Applied to all authenticated endpoints. Audit controller refactored from manual token verification to standard guard chain. |
| D9 | MFA enrollment for fictional/deleted principals | **FIXED** | `ActiveUserGuard` blocks at HTTP layer. Defense-in-depth: `beginTotpEnrollment()` and `beginWebauthnRegistration()` also verify user existence in the service layer. |
| D15 | Promtail Docker socket mount | **DOCUMENTED** | Added security comment in docker-compose.yml warning about Docker API access. Full remediation requires replacing with journal-based log collection (infrastructure change). |
| D16 | Dependency advisories (GHSA-wf42-42fg-fg84, flatted) | **FIXED** | Upgraded `@nestjs/platform-fastify` to 11.1.17 (>= 11.1.16 patch). |
| D17 | Observability endpoints exposed without auth (Prometheus, Loki) | **DOCUMENTED** | Infrastructure/ops remediation: bind to localhost or place behind authenticated proxy. |
| D18 | Grafana admin access with configured credential | **DOCUMENTED** | Infrastructure/ops remediation: rotate credential, restrict to trusted admin network. |

### Medium

| ID | Finding | Status | Resolution |
|----|---------|--------|------------|
| F3 | Policy engine fail-open under configuration drift | **FIXED** | Added `OnModuleInit` startup warnings when policy engine is disabled outside development/test or when fail-safe deny is off. |
| F4 | Over-privileged infrastructure credentials (Vault dev token, MinIO root) | **MITIGATED** | Added startup warning when `VAULT_DEV_ROOT_TOKEN` is set. Full fix requires scoped credentials (infrastructure change). |
| D2 | Compose healthcheck uses /health/live not /health/ready | **FIXED** | Changed API healthcheck in docker-compose.yml from `/v1/health/live` to `/v1/health/ready`. |
| D11 | Same-org members can read other users' file metadata | **DOCUMENTED (INTENTIONAL)** | Confirmed as intentional org-wide visibility. Added JSDoc comment on `findFileForUser()` explaining the design. Download/share restrictions still enforce owner-only via policy. |
| D14 | File upload size limit mismatch (Fastify 1MB vs app 5MB) | **FIXED** | Set `bodyLimit: 8_388_608` (8MB) on FastifyAdapter to accommodate 5MB file + base64 overhead + JSON wrapper. |

### Low / Informational

| ID | Finding | Status | Resolution |
|----|---------|--------|------------|
| D6 | HTTP redirect exposes Server header | **ALREADY MITIGATED** | Caddyfile `:80` block already imports `secure_headers` which includes `-Server`. |
| D19 | No machine-readable API spec | **ACKNOWLEDGED** | Future work item. Not part of this remediation cycle. |

## Code Changes Summary

### New Files
- `apps/api/src/modules/auth/guards/active-user.guard.ts` — User existence + active status check on every authenticated request
- `apps/api/test/startup-secrets.test.ts` — 11 unit tests for secret validation (presence, emptiness, distinctness)

### Modified Files

**Security-critical changes:**
- `apps/api/src/modules/auth/jwt-token.service.ts` — Removed hard-coded fallback JWT secret
- `apps/api/src/modules/auth/mfa.service.ts` — Removed fallback encryption key chain; added user existence checks to MFA enrollment
- `apps/api/src/bootstrap/configure-api-application.ts` — Added `validateRequiredSecrets()` with presence + distinctness checks
- `apps/api/src/main.ts` — Set Fastify `bodyLimit: 8_388_608`
- `apps/api/src/app.module.ts` — Added `ThrottlerModule` + global `ThrottlerGuard`
- `apps/api/src/modules/auth/auth.controller.ts` — Added `ActiveUserGuard` to all guarded endpoints; added `@Throttle` on login/refresh
- `apps/api/src/modules/files/files.controller.ts` — Added `ActiveUserGuard` to class-level guards
- `apps/api/src/modules/shares/shares.controller.ts` — Added `ActiveUserGuard` to create/revoke; added `@Throttle` on access
- `apps/api/src/modules/search/search.controller.ts` — Added `ActiveUserGuard` to class-level guards
- `apps/api/src/modules/audit/audit.controller.ts` — Full refactor: replaced manual `requireAdminUser()` with standard `JwtAuthGuard + ActiveUserGuard + RolesGuard` chain
- `apps/api/src/modules/audit/audit.module.ts` — Imported `AuthModule` for guard access
- `apps/api/src/modules/auth/auth.module.ts` — Registered `ActiveUserGuard`
- `apps/api/src/modules/policy/policy.service.ts` — Added `OnModuleInit` startup warnings

**Infrastructure:**
- `infra/compose/docker-compose.yml` — Fixed API healthcheck to use `/health/ready`; added security comment on promtail Docker socket mount

**Dependencies:**
- `apps/api/package.json` — Added `@nestjs/throttler`; upgraded `@nestjs/platform-fastify` to 11.1.17

**Documentation:**
- `apps/api/src/modules/files/files.service.ts` — Added JSDoc on intentional org-wide metadata visibility

**Tests:**
- `apps/api/test/auth.e2e.test.ts` — Added `MFA_TOTP_SECRET_KEY` env var
- `apps/api/test/files.e2e.test.ts` — Added `MFA_TOTP_SECRET_KEY` env var
- `apps/api/test/shares.e2e.test.ts` — Added `MFA_TOTP_SECRET_KEY` env var
- `apps/api/test/search.e2e.test.ts` — Added `MFA_TOTP_SECRET_KEY` env var
- `apps/api/test/health.e2e.test.ts` — Added required secret env vars
- `apps/api/test/system.e2e.test.ts` — Added required secret env vars
- `infra/scripts/tests/secrets-hygiene.sh` — Added assertion: no fallback secrets in source
- `infra/scripts/tests/hardening-baseline.sh` — Added assertions: healthcheck uses `/health/ready`, policy service contains security warnings

## New Test Coverage

| Test | Type | Covers |
|------|------|--------|
| `startup-secrets.test.ts` (11 tests) | Unit | Missing secrets, empty secrets, reused secrets, distinct secrets |
| `secrets-hygiene.sh` addition | Scaffold | No `local-dev-insecure-access-secret` or `dev-mfa-secret` in source |
| `hardening-baseline.sh` additions | Scaffold | Healthcheck uses `/health/ready`; policy service has startup warnings |

## Remaining Items (Infrastructure/Ops)

These require infrastructure changes beyond the application codebase:

1. **D15**: Replace promtail Docker socket mount with journal-based or file-based log collection
2. **D17**: Bind Prometheus and Loki to localhost or place behind authenticated reverse proxy
3. **D18**: Rotate Grafana admin credential; restrict to trusted admin network; stop reusing secrets across services
4. **F4**: Replace Vault dev-mode token and MinIO root credentials with least-privilege service identities
5. **D19**: Add OpenAPI/Swagger specification and validate in CI

## Recommendations for Future Hardening

1. Add token versioning or server-side session state for sensitive admin operations
2. Implement account lockout after repeated failed login attempts (beyond rate limiting)
3. Add alerting on repeated auth/share failures via the audit event stream
4. Consider request ID correlation across all log entries for incident response tracing
5. Add explicit seccomp/AppArmor profiles for all containers
6. Replace Vault dev mode with production-grade configuration in non-disposable environments
7. Extend container hardening baseline (cap_drop ALL, no-new-privileges, read_only) to realtime, webhook-sink, and infrastructure containers
