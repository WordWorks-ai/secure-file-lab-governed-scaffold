# Security Review Findings

Date: 2026-03-24

Repository: `secure-file-lab-governed-scaffold`

Scope:
- Manual static analysis of the current repository state
- Comparison against the 2026-03-19 findings document and the 2026-03-19 remediation note
- Focus on auth, MFA, policy, file/share access, compose exposure, and dependency posture

Limitations:
- This review is static-only. I did not validate a live deployment in this pass.
- I did not run the test suite or a fresh dependency audit from this shell. `corepack pnpm --version` failed with `EPERM` while trying to create `C:\Users\rober\AppData\Local\node\corepack\v1`, and the repo does not currently have a local `node_modules` directory.

## Executive Summary

Several high-risk issues from the 2026-03-19 report have been fixed in source: the hard-coded JWT fallback secret is gone, MFA now requires its own secret, secret reuse checks were added, auth/share throttling was introduced, the Nest Fastify advisory has been patched, and protected routes now revalidate that the backing user exists and is active.

The repo still has important security gaps. The most significant static issue is that admin authorization still trusts the role claim in the JWT rather than the current role in persistent storage. In addition, the compose stack still exposes a broad management and observability plane with weak defaults, keeps the `promtail` Docker socket mount, leaves the policy engine disabled by default, and continues to depend on Vault dev mode and MinIO root credentials.

## What Has Been Fixed Since 2026-03-19

### Fixed

1. Hard-coded JWT fallback secret removed.
   - `apps/api/src/modules/auth/jwt-token.service.ts:117`
   - `apps/api/src/modules/auth/jwt-token.service.ts:120`
   - `apps/api/src/bootstrap/configure-api-application.ts:22`
   - `apps/api/src/bootstrap/configure-api-application.ts:29`

2. MFA TOTP fallback key chain removed; a dedicated MFA secret is now required.
   - `apps/api/src/modules/auth/mfa.service.ts:425`
   - `apps/api/src/modules/auth/mfa.service.ts:428`
   - `apps/api/src/bootstrap/configure-api-application.ts:22`

3. Startup validation now rejects weak or reused secrets.
   - `apps/api/src/bootstrap/configure-api-application.ts:40`
   - `apps/api/src/bootstrap/configure-api-application.ts:58`

4. Auth and public share endpoints now have throttling.
   - `apps/api/src/app.module.ts:4`
   - `apps/api/src/modules/auth/auth.controller.ts:39`
   - `apps/api/src/modules/auth/auth.controller.ts:67`
   - `apps/api/src/modules/auth/auth.controller.ts:85`
   - `apps/api/src/modules/shares/shares.controller.ts:67`

5. Protected routes now revalidate that the token subject maps to an active user.
   - `apps/api/src/modules/auth/guards/active-user.guard.ts:22`
   - `apps/api/src/modules/auth/guards/active-user.guard.ts:27`
   - `apps/api/src/modules/files/files.controller.ts:28`
   - `apps/api/src/modules/search/search.controller.ts:21`
   - `apps/api/src/modules/audit/audit.controller.ts:25`

6. The API healthcheck in compose now uses readiness rather than liveness.
   - `infra/compose/docker-compose.yml:555`

7. The previously reported dependency advisories appear addressed in source and lockfile.
   - `apps/api/package.json:23`
   - `package.json:30`
   - `pnpm-lock.yaml:652`
   - `pnpm-lock.yaml:2224`

### Partially Fixed

1. Forged or fictional principals are much better constrained, but privileged role checks still trust JWT role claims.
   - Active-user revalidation was added:
     - `apps/api/src/modules/auth/guards/active-user.guard.ts:22`
   - Admin routes still authorize directly from `request.user.role`:
     - `apps/api/src/modules/auth/guards/roles.guard.ts:36`
     - `apps/api/src/modules/auth/guards/jwt-auth.guard.ts:21`

2. Login/share abuse resistance improved with throttling, but I did not find account-aware lockout or similar persistence-based anti-automation controls in the current source.

## Current Findings

### 1. High: Admin-only authorization still trusts the JWT role claim rather than current stored role

Severity: High

Affected code:
- `apps/api/src/modules/auth/guards/jwt-auth.guard.ts:21`
- `apps/api/src/modules/auth/guards/active-user.guard.ts:22`
- `apps/api/src/modules/auth/guards/roles.guard.ts:36`
- `apps/api/src/modules/auth/jwt-token.service.ts:27`
- `apps/api/src/modules/auth/auth.controller.ts:130`
- `apps/api/src/modules/audit/audit.controller.ts:24`

Details:
- `JwtAuthGuard` places the verified JWT claims directly onto `request.user`.
- `ActiveUserGuard` checks only that the user exists and is active.
- `RolesGuard` then authorizes by comparing the required role to `request.user.role`, which still comes from the token payload rather than the current database record.
- This means a previously issued admin token can remain admin-capable after a role downgrade until token expiry. If the JWT signing secret is ever compromised, server-side role revalidation still would not stop a forged admin claim for any active user id.

Impact:
- Stale-privilege access after role changes
- Residual admin-route trust in bearer-token claims instead of current authorization state

Recommended remediation:
- Rehydrate the current user role from persistent storage before role enforcement on privileged routes.
- Prefer a single auth guard that both validates existence/active state and attaches current role data.
- Add tests covering role downgrade and disabled-user cases for admin-only endpoints.

### 2. High: Observability and management services remain exposed on host ports with weak or missing access controls

Severity: High

Affected configuration:
- `infra/compose/docker-compose.yml:181`
- `infra/compose/docker-compose.yml:182`
- `infra/compose/docker-compose.yml:206`
- `infra/compose/docker-compose.yml:221`
- `infra/compose/docker-compose.yml:248`
- `infra/compose/docker-compose.yml:359`
- `infra/compose/docker-compose.yml:372`
- `infra/compose/docker-compose.yml:398`
- `infra/compose/docker-compose.yml:399`
- `infra/compose/docker-compose.yml:405`

Details:
- `prometheus`, `loki`, and `grafana` are published directly to host ports.
- Grafana still falls back to `admin/admin` if explicit credentials are not provided.
- Keycloak still falls back to `admin/admin` when the enterprise profile is used.
- OPA is exposed on a host port.
- OpenSearch disables its security plugin and OpenSearch Dashboards is also published on a host port.

Impact:
- Increased risk of accidental management-plane exposure in shared or semi-trusted environments
- Weak-default administrative access if operators bring profiles up without overriding credentials
- Easier service enumeration and operator-surface abuse

Recommended remediation:
- Remove host port publishing for internal observability and management components by default.
- Require explicit non-default credentials for Grafana and Keycloak startup.
- Do not run OpenSearch with `DISABLE_SECURITY_PLUGIN=true` outside disposable local lab scenarios.
- Gate optional profiles behind safer defaults and stronger documentation warnings.

### 3. High: `promtail` still mounts the Docker socket

Severity: High

Affected configuration:
- `infra/compose/docker-compose.yml:376`
- `infra/compose/docker-compose.yml:386`
- `infra/observability/promtail-config.yml:14`

Details:
- The observability profile still mounts `/var/run/docker.sock` into `promtail`.
- The promtail configuration explicitly uses Docker service discovery against that socket.
- Read-only bind semantics do not meaningfully protect a Unix socket from API use.

Impact:
- A compromise of `promtail` can plausibly become effective Docker daemon control
- This materially increases host-compromise blast radius from the observability plane

Recommended remediation:
- Remove Docker socket access from `promtail`.
- Replace Docker service discovery with a lower-privilege collection path such as static targets, file-based log shipping, or a journal-based collector.

### 4. Medium: Policy enforcement still fails open when disabled and remains disabled by default in compose

Severity: Medium

Affected code and configuration:
- `apps/api/src/modules/policy/policy.service.ts:46`
- `apps/api/src/modules/policy/policy.service.ts:48`
- `apps/api/src/modules/policy/policy.service.ts:109`
- `apps/api/src/modules/policy/policy.service.ts:110`
- `apps/api/src/modules/policy/policy.service.ts:224`
- `apps/api/src/modules/policy/policy.service.ts:228`
- `infra/compose/docker-compose.yml:483`
- `infra/compose/docker-compose.yml:484`

Details:
- When the policy engine is disabled, the service returns an allow decision with reason `policy_engine_disabled`.
- The compose default still sets `POLICY_ENGINE_ENABLED` to `false`.
- If `POLICY_ENGINE_FAIL_SAFE_DENY=false`, OPA errors also turn into allow decisions.
- Local ABAC helps on current modeled actions, but this remains brittle for future actions or partial policy coverage.

Impact:
- Authorization weakening under configuration drift
- Higher chance that new actions ship without centralized deny-by-default policy coverage

Recommended remediation:
- Default `POLICY_ENGINE_ENABLED` to `true` for any hardened profile.
- Treat policy disablement as a startup error outside explicit local-development modes.
- Remove or tightly constrain the `fallback_allow` path.

### 5. Medium: Runtime services still depend on root or dev infrastructure credentials

Severity: Medium

Affected code and configuration:
- `infra/compose/docker-compose.yml:69`
- `infra/compose/docker-compose.yml:70`
- `infra/compose/docker-compose.yml:104`
- `infra/compose/docker-compose.yml:106`
- `infra/compose/docker-compose.yml:587`
- `infra/compose/docker-compose.yml:588`
- `apps/api/src/modules/files/vault-transit.service.ts:57`
- `apps/api/src/modules/files/minio-object-storage.service.ts:146`
- `apps/worker/src/modules/jobs/services/worker-vault-transit.service.ts:43`
- `apps/worker/src/modules/jobs/services/worker-minio-object-storage.service.ts:110`

Details:
- Vault is still started in dev mode with `server -dev` and `VAULT_DEV_ROOT_TOKEN`.
- API and worker code still require `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, and `VAULT_DEV_ROOT_TOKEN` for core operations.
- The new startup validation detects some bad secret hygiene, but it does not reduce privilege scope.

Impact:
- Broader blast radius if the API, worker, or their environment leaks
- Easier pivot from application compromise into object storage or Vault administration

Recommended remediation:
- Replace MinIO root credentials with app-scoped service credentials.
- Replace Vault dev mode and the dev root token with a non-dev auth method and least-privilege transit access.

### 6. Low: Throttling is present, but the code still does not show account-aware lockout or durable abuse controls

Severity: Low

Affected code:
- `apps/api/src/app.module.ts:23`
- `apps/api/src/modules/auth/auth.controller.ts:39`
- `apps/api/src/modules/auth/auth.controller.ts:67`
- `apps/api/src/modules/auth/auth.controller.ts:85`
- `apps/api/src/modules/shares/shares.controller.ts:67`

Details:
- The current implementation adds request throttling, which is a meaningful improvement.
- I did not find persistent per-account lockout, risk scoring, or similar stateful anti-automation controls in the current source.

Impact:
- Reduced but not eliminated exposure to credential stuffing and online guessing

Recommended remediation:
- Add account-aware lockout or step-up controls for repeated login failures.
- Add stronger telemetry and alerting around repeated share-password failures.

## Items I Did Not Reclassify As Current Vulnerabilities

- Same-org file metadata and search visibility still appear intentional. `FilesService` explicitly documents org-wide metadata visibility and restricts download/share through separate checks. I would treat this as a product decision unless requirements say owner-only visibility is intended.
- The March 19 dynamic findings about a broken live database password, HTTP `Server` disclosure, and live token forgery were not retested in this pass.

## Recommended Next Steps

1. Fix role revalidation so admin-only authorization does not depend on JWT role claims.
2. Remove the `promtail` Docker socket mount.
3. Close or harden the host-exposed observability and management plane, especially Grafana, Keycloak, OpenSearch, Prometheus, and Loki.
4. Change hardened profiles to fail closed on policy by default.
5. Replace Vault dev mode and MinIO root credentials with least-privilege service identities.
6. Add account-aware lockout and related auth abuse telemetry on top of the new throttling layer.

## Runtime Validation Note (2026-03-24)

A live browser pass against https://localhost:8443/ identified a runtime blocker that was not visible in the static-only review:

- Auth was validated live after reseeding dmin@local.test with a known temporary password.
- Core unauthenticated harness routes worked live: /v1/health/live, /v1/health/ready, /v1/system/info, /v1/system/echo.
- The authenticated file upload path is currently broken at runtime because Vault transit encryption fails with 503 Service Unavailable and 
o handler for route "transit/encrypt/file-dek-v1".
- That runtime break blocks deeper live testing of upload-backed and metadata-backed stored-content attack paths until Vault transit is repaired.
- The web harness also clears its local auth state after a logout-form validation failure, even though the previously issued access token and refresh token remain valid server-side. This is a client-state handling issue rather than a server-side logout success.
