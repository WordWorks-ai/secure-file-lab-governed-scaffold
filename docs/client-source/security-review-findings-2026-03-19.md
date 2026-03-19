# Security Review Findings

Date: 2026-03-19

Repository: `secure-file-lab-governed-scaffold`

Scope:
- Manual source review of the API, auth, file, share, search, policy, and storage integration paths
- Attempted package vulnerability audit via `pnpm audit --audit-level high`

## Executive Summary

The highest-risk issue is a hard-coded fallback JWT signing secret that can allow forged access tokens when `JWT_ACCESS_SECRET` is unset. I also found weak fallback handling for MFA secret encryption, fail-open policy behavior under plausible configuration drift, and use of highly privileged infrastructure credentials at runtime. In addition, the public authentication and share-access surfaces do not appear to have rate limiting or lockout controls.

## Findings

### 1. High: Hard-coded fallback JWT signing secret allows token forgery

Severity: High

Affected code:
- [apps/api/src/modules/auth/jwt-token.service.ts](/mnt/c/Users/rober/engagements/worldworksAI/secure-file-lab-governed-scaffold/apps/api/src/modules/auth/jwt-token.service.ts#L22)
- [apps/api/src/modules/auth/jwt-token.service.ts](/mnt/c/Users/rober/engagements/worldworksAI/secure-file-lab-governed-scaffold/apps/api/src/modules/auth/jwt-token.service.ts#L117)

Details:
- Access tokens are signed and verified with `JWT_ACCESS_SECRET`.
- If that environment variable is absent, the service falls back to the hard-coded value `local-dev-insecure-access-secret`.
- Any deployment path that boots without a real secret becomes vulnerable to forged tokens, including forged `admin` tokens.

Impact:
- Full authentication bypass
- Privilege escalation to arbitrary application roles

Recommended remediation:
- Remove the fallback secret entirely.
- Fail application startup if `JWT_ACCESS_SECRET` is unset or weak.
- Add a startup validation test that asserts production boot fails without the secret.

### 2. High: MFA TOTP secrets use a predictable fallback encryption key

Severity: High

Affected code:
- [apps/api/src/modules/auth/mfa.service.ts](/mnt/c/Users/rober/engagements/worldworksAI/secure-file-lab-governed-scaffold/apps/api/src/modules/auth/mfa.service.ts#L413)

Details:
- TOTP secrets are encrypted with `MFA_TOTP_SECRET_KEY`, or if absent, `JWT_ACCESS_SECRET`, or if that is also absent, the hard-coded value `dev-mfa-secret`.
- This makes MFA secret protection depend on application secret hygiene.
- In the misconfigured case where both environment variables are missing, encrypted TOTP seeds are recoverable with a known key.

Impact:
- Recovery of enrolled MFA secrets from stored data
- MFA bypass after database compromise in weakly configured environments

Recommended remediation:
- Require a dedicated `MFA_TOTP_SECRET_KEY`.
- Fail startup if it is missing.
- Do not derive MFA encryption from the JWT secret.

### 3. Medium: Policy engine can fail open under configuration drift

Severity: Medium

Affected code:
- [apps/api/src/modules/policy/policy.service.ts](/mnt/c/Users/rober/engagements/worldworksAI/secure-file-lab-governed-scaffold/apps/api/src/modules/policy/policy.service.ts#L24)
- [apps/api/src/modules/policy/policy.service.ts](/mnt/c/Users/rober/engagements/worldworksAI/secure-file-lab-governed-scaffold/apps/api/src/modules/policy/policy.service.ts#L79)

Details:
- When `POLICY_ENGINE_ENABLED` is false, policy decisions default to allow unless local ABAC blocks them.
- If `POLICY_ENGINE_FAIL_SAFE_DENY` is set to false, OPA failures also become allow decisions.
- This is especially risky for future endpoints or policy actions that are not fully covered by local ABAC logic.

Impact:
- Authorization weakening during outage or misconfiguration
- Increased chance of silently exposing new actions without policy enforcement

Recommended remediation:
- Enforce fail-closed behavior for all production environments.
- Treat disabled policy engine as a startup error outside explicit local-development modes.
- Add tests that assert unknown or unmodeled actions are denied.

### 4. Medium: Runtime services use over-privileged infrastructure credentials

Severity: Medium

Affected code:
- [apps/api/src/modules/files/vault-transit.service.ts](/mnt/c/Users/rober/engagements/worldworksAI/secure-file-lab-governed-scaffold/apps/api/src/modules/files/vault-transit.service.ts#L56)
- [apps/api/src/modules/files/minio-object-storage.service.ts](/mnt/c/Users/rober/engagements/worldworksAI/secure-file-lab-governed-scaffold/apps/api/src/modules/files/minio-object-storage.service.ts#L145)

Details:
- Vault operations use `VAULT_DEV_ROOT_TOKEN`.
- MinIO operations use root credentials via `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`.
- If the API or worker process is compromised, the attacker inherits infrastructure-wide privileges rather than narrowly scoped application credentials.

Impact:
- Full object-store compromise
- Full Vault compromise for the used token scope
- Easier post-exploitation pivoting

Recommended remediation:
- Replace dev root credentials with least-privilege service identities.
- Scope MinIO credentials to the required bucket and object actions only.
- Scope Vault credentials to the exact transit capabilities needed.

### 5. Medium: No visible rate limiting on login and public share access

Severity: Medium

Affected code:
- [apps/api/src/modules/auth/auth.controller.ts](/mnt/c/Users/rober/engagements/worldworksAI/secure-file-lab-governed-scaffold/apps/api/src/modules/auth/auth.controller.ts#L34)
- [apps/api/src/modules/auth/auth.service.ts](/mnt/c/Users/rober/engagements/worldworksAI/secure-file-lab-governed-scaffold/apps/api/src/modules/auth/auth.service.ts#L48)
- [apps/api/src/modules/shares/shares.controller.ts](/mnt/c/Users/rober/engagements/worldworksAI/secure-file-lab-governed-scaffold/apps/api/src/modules/shares/shares.controller.ts#L62)
- [apps/api/src/modules/shares/shares.service.ts](/mnt/c/Users/rober/engagements/worldworksAI/secure-file-lab-governed-scaffold/apps/api/src/modules/shares/shares.service.ts#L268)

Details:
- I did not find request throttling, lockout, or similar abuse controls on:
- password login
- MFA login verification path
- refresh-token entry points
- unauthenticated share-token access
- password-protected share access

Impact:
- Higher exposure to credential stuffing and password guessing
- Higher exposure to online guessing against password-protected share links

Recommended remediation:
- Add IP- and account-aware throttling for auth endpoints.
- Add throttling for share access and share-password verification.
- Add alerting on repeated failures for both surfaces.

## Additional Notes

- Search results appear intentionally scoped to organization membership rather than ownership, so I did not classify that behavior as a vulnerability without a stronger product requirement stating otherwise.
- The codebase has multiple hardening-oriented scripts and tests, but several critical security behaviors still depend heavily on correct environment configuration.

## Dependency Audit Status

Attempted commands:

```bash
pnpm --version
pnpm audit --audit-level high
corepack pnpm --version
corepack pnpm audit --audit-level high
```

Observed results:
- `pnpm` is not on `PATH` in the current shell.
- `corepack` is installed, but `corepack pnpm` fails before invoking pnpm because of a signature verification error:

```text
Error: Cannot find matching keyid
```

Conclusion:
- I could not complete a package vulnerability audit from this environment.
- The current blocker is toolchain setup, not repository code.

## Dynamic Audit Results

Date: 2026-03-19

Live target:
- `https://localhost:18443`

Validated runtime observations:
- `GET /v1/health/live` returned `200 OK`
- `GET /v1/health/ready` returned `503` with `"database": false`
- Caddy is applying the expected security headers on live responses
- The running API container has `POLICY_ENGINE_ENABLED=false`
- The running API container is configured with `VAULT_DEV_ROOT_TOKEN`, `MINIO_ROOT_USER`, and `MINIO_ROOT_PASSWORD`

### D1. High: Core auth and share-access paths fail with unhandled 500s because API database credentials are wrong

Severity: High

Live evidence:
- `POST /v1/auth/login` returned `500 Internal Server Error`
- `POST /v1/shares/access` returned `500 Internal Server Error`
- API logs show `PrismaClientInitializationError` with:
- `Authentication failed against database server, the provided database credentials for 'sfl' are not valid`

Observed configuration mismatch:
- Running API container `DATABASE_URL` contains `postgresql://sfl:CHANGE_ME_POSTGRES_PASSWORD@postgres:5432/sfl?schema=public`
- Running Postgres container uses `POSTGRES_PASSWORD=60d5b3f3cf215f69067c4d0c9b45e7178ee572ccbf33f26f`

Impact:
- Login is unavailable
- Share-link access is unavailable
- Any endpoint requiring Prisma database access can fail with 500s

Recommended remediation:
- Align `DATABASE_URL` with the actual Postgres password being injected into the database container.
- Add startup validation that performs a real Prisma query before declaring the API ready.
- Map Prisma initialization errors to controlled dependency-failure responses where feasible.

### D2. Medium: Compose healthcheck marks API healthy while readiness is failing

Severity: Medium

Affected configuration:
- [infra/compose/docker-compose.yml](/mnt/c/Users/rober/engagements/worldworksAI/secure-file-lab-governed-scaffold/infra/compose/docker-compose.yml#L546)

Details:
- The running `api` container is shown as healthy by Docker.
- The configured healthcheck only probes `/v1/health/live`.
- The readiness endpoint is returning `503` because the database dependency is not usable.

Impact:
- Orchestration and operators can receive a false healthy signal.
- Traffic can continue to route to an instance that cannot serve core business functions.

Recommended remediation:
- Base container health on `/v1/health/ready`, or make liveness and readiness semantics explicit at the orchestration layer.
- Include a real database-usable check in the health path used for traffic admission.

### D3. Medium: Runtime policy enforcement is disabled in the live container

Severity: Medium

Live evidence:
- Running API environment includes `POLICY_ENGINE_ENABLED=false`
- Running API environment includes `POLICY_LOCAL_ABAC_ENABLED=true`

Details:
- The live deployment is relying on local ABAC only.
- OPA-backed policy enforcement is not active in the running stack.

Impact:
- Authorization coverage depends entirely on local code paths.
- New actions or incomplete local checks can ship without centralized policy protection.

Recommended remediation:
- Enable the policy engine for environments intended to represent hardened or production-like operation.
- Add a deployment gate that fails if policy is disabled outside explicit development modes.

### D4. Positive: Edge routing and baseline response headers are present

Observed:
- HTTP on `:18080` redirects to HTTPS
- HTTPS responses include `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`

Interpretation:
- This part of the live deployment matched the expected baseline and did not present an immediate issue during testing.

### D5. Medium: No effective throttling observed on repeated login and share-token failures

Severity: Medium

Live evidence:
- 20 consecutive invalid login attempts returned `401`
- 20 consecutive invalid share-token access attempts returned `403`
- No `429`, temporary block, or escalating response was observed during the burst

Details:
- The live application remains responsive and consistent under repeated bad requests.
- That is desirable for availability, but no anti-automation control was visible from the edge during testing.

Impact:
- Higher exposure to credential stuffing and password guessing
- Higher exposure to online guessing against password-protected share links

Recommended remediation:
- Add per-IP and per-account throttling on auth endpoints.
- Add per-IP throttling on public share access.
- Add observability and alerting for repeated denied auth/share attempts.

### D6. Low: HTTP redirect path still exposes a `Server` header

Severity: Low

Live evidence:
- `GET http://localhost:18080/v1/health/live` returned `308`
- Response included `Server: Caddy`

Details:
- HTTPS application responses had the intended header suppression behavior.
- The plaintext HTTP redirect response still discloses the edge product name.

Impact:
- Minor technology fingerprinting

Recommended remediation:
- Suppress or overwrite the `Server` header on the HTTP redirect path as well if consistent header minimization is required.

### D7. High: Secret reuse enables admin JWT forgery if a co-hosted credential leaks

Severity: High

Live evidence:
- Running API container environment shows:
- `JWT_ACCESS_SECRET=651088259c02d537147497384627bb8d7932e1e3fdb5f2a4`
- `MINIO_ROOT_PASSWORD=651088259c02d537147497384627bb8d7932e1e3fdb5f2a4`
- Using that shared secret, a forged JWT with `role=admin` was accepted by `GET /v1/auth/admin-check`, which returned `200 {"allowed":true}`

Details:
- The issue is not that JWTs are self-contained; that is expected.
- The issue is that the signing secret is reused as another high-value infrastructure credential.
- If the MinIO root password leaks through any adjacent path, the attacker can immediately mint arbitrary bearer tokens for the API.

Impact:
- Full application authentication bypass after compromise of a reused secret
- Cross-service blast radius amplification from a single secret disclosure

Recommended remediation:
- Use distinct, independently rotated secrets for JWT signing and MinIO administration.
- Reduce MinIO credentials from root scope to least privilege.
- Consider verifying user existence and active status on high-risk privileged operations if token compromise is in scope.

### D8. High: Privileged routes trust signed JWT claims without revalidating the backing user

Severity: High

Live evidence:
- A forged admin JWT for subject `00000000-0000-4000-8000-000000000001` was accepted by:
- `GET /v1/auth/me`, which returned the forged claims
- `GET /v1/auth/admin-check`, which returned `200 {"allowed":true}`
- `GET /v1/audit/events?limit=1`, which returned live audit data
- `GET /v1/audit/events/export?limit=2`, which returned NDJSON audit records
- `GET /v1/audit/events/summary?limit=20&top=5`, which returned live aggregate telemetry
- `GET /v1/auth/mfa/status`, which returned an MFA status object for the fictional principal
- A forged member JWT was denied on `GET /v1/auth/admin-check` with `403`, confirming the gate relies on token claims rather than current user state
- By contrast, `POST /v1/files/upload` with the same forged admin JWT was denied with `403 Authenticated user does not exist`, confirming some state-changing flows do perform a database-backed existence check

Details:
- Once the signing secret is known, the API appears to trust the JWT payload as authoritative for role and identity.
- The tested privileged routes did not revalidate that the user exists, is active, or still holds the claimed role in persistent storage.
- The behavior is inconsistent across the application: some mutation paths revalidate the user, but several read and admin paths do not.

Impact:
- Full authorization bypass after signing-secret compromise
- Continued access for deleted, disabled, or fictional principals if a validly signed token is presented
- Direct exposure of sensitive admin data such as audit events

Recommended remediation:
- Revalidate user existence and active status for privileged operations, especially admin-only endpoints.
- Consider token versioning, revocation, or short-lived tokens backed by server-side state for sensitive routes.
- Keep signing secrets isolated from any other service credentials so this path is much harder to reach in practice.
- Standardize authz behavior so privileged reads and writes apply the same principal validation rules.

### D9. High: MFA registration flows handle fictional signed principals inconsistently and can issue WebAuthn challenges

Severity: High

Live evidence:
- `POST /v1/auth/mfa/totp/enroll` with a forged admin JWT returned `500 Internal server error`
- API logs show a Prisma foreign-key failure on `user_mfa_totp_factors_user_id_fkey`
- `POST /v1/auth/mfa/webauthn/register/options` with the same forged admin JWT returned `201`
- The response contained a valid-looking challenge token and registration options for fictional user id `00000000-0000-4000-8000-000000000001`
- API logs show the associated audit write failed on `audit_events_actor_user_id_fkey`, but the endpoint still returned success

Details:
- The TOTP path attempts to persist factor state for a nonexistent user and fails open as an unhandled `500`.
- The WebAuthn registration-options path is more serious: it issues a challenge and options payload for a nonexistent user without first validating that the principal exists.
- The audit trail for that event is not reliably written because the fictional actor id violates the audit table foreign key.

Impact:
- Inconsistent principal validation across MFA surfaces
- Reduced audit integrity for forged-principal actions
- WebAuthn challenge issuance for nonexistent identities, which should not happen on a hardened auth path
- Unhandled database errors surfaced as 500s on the TOTP path

Recommended remediation:
- Require a real, active backing user before any MFA enrollment or registration flow begins.
- Fail closed with a controlled `401` or `403` when the token subject does not exist.
- Treat audit write failure on security-sensitive flows as a blocker or route it through a resilient design that preserves integrity guarantees.
- Normalize database constraint failures into safe application errors instead of exposing generic 500 behavior.

### D10. Critical: JWT secret compromise allows full impersonation of the real admin account

Severity: Critical

Live evidence:
- The database contains a real active admin user:
- `3e7d8b31-4be6-4c13-a4c0-675f98d45322 | admin@local.test | admin`
- Using a forged JWT signed with the live `JWT_ACCESS_SECRET` for that real user, the API accepted the token on:
- `GET /v1/auth/me`
- `GET /v1/files/111187bf-adf8-46b6-b382-571924e1fe10/download`, which returned file contents
- `POST /v1/files/38b9a02d-b06a-4b1c-8953-1de0a0f80db9/activate`, which changed file state to `active`
- `POST /v1/files/upload`, which created a new file record and returned a new `fileId`

Details:
- This is the practical end-to-end impact of the earlier secret-reuse and claim-trust issues.
- Once the JWT signing secret is known, an attacker can impersonate the real administrator, not just invent fictional principals.
- The forged token is sufficient to perform authenticated state-changing operations as that user.

Impact:
- Full administrative account takeover
- Unauthorized access to protected file contents
- Unauthorized state transitions on governed files
- Unauthorized file creation under the administrator's organization scope

Recommended remediation:
- Treat this as the highest-priority finding in the report.
- Rotate `JWT_ACCESS_SECRET` immediately and ensure it is unique to JWT signing.
- Rotate any secrets currently sharing the same value, especially MinIO administrative credentials.
- Invalidate outstanding tokens after secret rotation.
- Add stronger server-side validation or session binding for high-risk operations so signed claims alone are not the only trust decision.

### D11. Medium: Same-org members can read file metadata and enumerate other users' files

Severity: Medium

Live evidence:
- I created a real same-org member account: `same-member@local.test`
- Using that member's token against an admin-owned file in the same org:
- `GET /v1/files/111187bf-adf8-46b6-b382-571924e1fe10` returned `200` with file metadata
- `GET /v1/search/files?q=burp&limit=10` returned results for admin-owned files, including:
- `filename`
- `status`
- `ownerUserId`
- `orgId`
- `createdAt` and `updatedAt`
- The same member was correctly denied on:
- `GET /v1/files/111187bf-adf8-46b6-b382-571924e1fe10/download` with `403`
- `POST /v1/shares` for the admin-owned file with `403`

Details:
- Cross-user access within the same organization is not owner-scoped for metadata and search visibility.
- The implementation appears to scope these reads by organization membership rather than by resource ownership.

Impact:
- Horizontal information disclosure inside an organization
- Members can enumerate filenames and operational states for files they do not own
- Members can correlate file ownership through `ownerUserId`

Recommended remediation:
- If same-org members should not see each other's file inventory, tighten metadata and search authorization to owner-only or explicit sharing rules.
- If this behavior is intentional, document it clearly as organization-wide visibility and remove `ownerUserId` from lower-privilege search results unless it is operationally required.

### D12. Positive: No cross-org IDOR was observed in the tested file and search paths

Observed:
- A real member from another org was denied on `GET /v1/files/{admin-file-id}` with `403`
- A real admin from another org was also denied on that same file with `403`
- Both cross-org principals received empty results from `GET /v1/search/files?q=burp&limit=10`

Interpretation:
- In the tested paths, cross-tenant isolation held.
- The main authorization weakness observed was horizontal same-org overexposure, not cross-org leakage.

### D13. Fuzzing Summary: most endpoints failed cleanly; the main unstable surface remained MFA with forged principals

Severity: Informational

Scope:
- Negative-input sweep routed through Burp across system, health, metrics, auth, files, shares, search, and audit endpoints
- Tested malformed JSON, missing required fields, extra fields, invalid UUIDs, unsupported methods, missing auth, malformed auth headers, and boundary query values

Observed good behavior:
- Most malformed requests returned controlled `400`, `401`, `403`, or `404` responses
- Examples included:
- validation failures on `system/echo`, `auth/login`, `auth/refresh`, `auth/sso/exchange`, and `auth/logout`
- `401` on missing or malformed auth headers
- `403` on role failures and unauthorized access attempts
- `404` on unsupported methods for simple GET endpoints

Observed error hotspots:
- `POST /v1/auth/mfa/totp/enroll` with a forged fictional principal still returned `500` because of a foreign-key constraint violation
- `POST /v1/auth/mfa/webauthn/register/options` with a forged fictional principal still returned `201` and issued registration material even though the corresponding audit write failed
- `GET /v1/auth/mfa/status` with a forged fictional principal still returned `200`

Interpretation:
- The API does not appear broadly crash-prone under malformed input.
- The highest-signal fuzzing issues were not generic parser bugs; they were authorization and principal-validation inconsistencies already identified elsewhere in this report.

### D14. File upload size limits: the live effective limit is much lower than the configured decoded-file limit

Severity: Medium

Configured behavior:
- The API code reads `FILE_UPLOAD_MAX_BYTES` and defaults to `5,242,880` bytes
- The live container is configured with `FILE_UPLOAD_MAX_BYTES=5242880`
- In code, that limit is applied to the decoded file payload after base64 decoding

Live behavior:
- A `512 KiB` raw file upload succeeded
- A `768 KiB` raw file upload was rejected with `413 Request body is too large`
- A `1 MiB` raw file upload was rejected with `413 Request body is too large`
- A `4 MiB` raw file upload was rejected with `413 Request body is too large`
- A `5 MiB` raw file upload was rejected with `413 Request body is too large`

Interpretation:
- The practical live ceiling is far below the configured `5 MiB` decoded-file limit.
- The rejection is happening before the application-level decoded-size check, likely at the HTTP body parsing layer.
- The observed cutoff is consistent with a request-body cap around `1 MiB` of JSON request size, which translates to a raw file limit somewhere below `768 KiB` once base64 and JSON overhead are included.
- Through Burp, large JSON uploads also produced `400 Body cannot be empty when content-type is set to 'application/json'`, which appears to be a proxy-path artifact on top of the underlying body-size issue.

Impact:
- Huge file uploads do not appear to crash the live app; they are rejected
- However, the documented/configured `5 MiB` limit is misleading in this deployment because the real usable upload size is much smaller
- Users and downstream systems may see inconsistent failures depending on whether traffic is proxied through Burp

Recommended remediation:
- Set the HTTP body-size limit explicitly to match the intended decoded upload ceiling plus base64/JSON overhead.
- Align product documentation and environment configuration with the actual enforced limit.
- If Burp or another proxy is part of the workflow, verify large-body handling there separately so debugging tools do not introduce misleading `400` responses.

### D15. Container and host-exposure review: observability now enables a live Docker-socket host-control path through Promtail

Severity: High

Scope:
- Reviewed the live Docker daemon posture and the running containers
- Reviewed the compose definitions for privilege, namespace sharing, capability changes, writable host binds, and Docker socket exposure

Live observations:
- Docker daemon security options reported `seccomp,profile=builtin` and `cgroupns`
- I did not find any running service with:
- `privileged: true`
- host PID mode
- host IPC mode
- host network mode
- direct device passthrough
- Observability is now enabled, and `promtail` is running with a live mount of `/var/run/docker.sock`
- Live `docker inspect` for `promtail` showed:
- `user=` which resolves to root in this image
- `readonly=false`
- no capability drops
- no `no-new-privileges`
- mounts including `/var/run/docker.sock:/var/run/docker.sock`
- Inside the running `promtail` container:
- `id` returned `uid=0(root) gid=0(root)`
- `/var/run/docker.sock` was present as `srw-rw---- root 117`
- The running `promtail` config explicitly uses `docker_sd_configs` with `host: unix:///var/run/docker.sock`

Hardened services:
- `api` and `worker` are the best-hardened containers in the stack
- In compose, both run as `user: 'node'`, `read_only: true`, `cap_drop: [ALL]`, and `security_opt: [no-new-privileges:true]`
- Live `docker inspect` matched that posture

Residual container-level risk:
- `realtime` and `webhook-sink` run as non-root and with `read_only: true`, but they do not drop all capabilities or set `no-new-privileges` in the current compose file
- Several infrastructure containers run with the more permissive defaults:
- `caddy`
- `postgres`
- `minio`
- `vault`
- `redis`
- `clamav`
- `web`
- `admin`
- `backup`
- `vault` explicitly adds `IPC_LOCK` and runs in dev mode
- `backup` has a writable host-backed bind mount to `../../backups`, so compromise of that container would permit modification of files in the host backup directory

High-signal repo finding:
- The `promtail` service mounts `/var/run/docker.sock:/var/run/docker.sock:ro` when the `observability` profile is enabled
- For a Unix socket, `:ro` does not materially prevent interaction with the Docker API
- In this live deployment, that condition is no longer hypothetical: `promtail` is running as root and is configured to use the Docker socket for service discovery
- A compromise of `promtail` would likely provide effective Docker-daemon control, which is commonly equivalent to host-root access

Interpretation:
- I did not confirm a kernel-level breakout primitive from the main app containers
- The main app compromise path remains the application-layer auth/token findings documented earlier in this report
- The strongest container/host escalation path is now active in the running stack: the `promtail` Docker socket mount
- The backup container's writable host bind is a smaller but real host-impact path if that service is compromised

Recommended remediation:
- Treat the live `promtail` Docker socket mount as a host-exposure issue, not just a container-hardening gap
- Remove the Docker socket mount from `promtail`, or isolate log collection so it does not require daemon access
- Apply the same hardening baseline used by `api` and `worker` to `realtime` and `webhook-sink`
- If `promtail` must remain, run it as non-root with an explicit hardening profile and remove any daemon access that is not strictly required
- Where possible, run infrastructure containers as non-root, with read-only root filesystems and explicit capability drops
- Replace Vault dev mode with a non-dev configuration for any environment that is not strictly disposable
- Review the `backup` container's writable bind and narrow it if host write access is not strictly required
- Consider enabling additional runtime confinement such as explicit seccomp/AppArmor profiles and user-namespace remapping if the Docker host supports them

### D16. Dependency audit: confirmed high-severity advisories in current lockfile

Severity: High

Tooling note:
- The environment did not have `pnpm` on `PATH`
- I resolved that by using Corepack with writable state under `/tmp` and ran the audit script with `PNPM_CLI_JS` pointing at the downloaded CLI
- The audit is no longer blocked by local tooling

Command result:
- `bash infra/scripts/tests/dependency-audit.sh` exited non-zero because `pnpm audit --audit-level high` found advisories

Confirmed high-severity findings:
- `@nestjs/platform-fastify@11.1.15` is affected by `GHSA-wf42-42fg-fg84`
- Advisory title: `Nest Fastify HEAD Request Middleware Bypass`
- Affected paths:
- `apps/api > @nestjs/platform-fastify@11.1.15`
- `apps/worker > @nestjs/platform-fastify@11.1.15`
- Patched range: `>=11.1.16`

- `flatted@3.3.4` is affected by `GHSA-25h7-pfq9-p65f`
- Advisory title: `flatted vulnerable to unbounded recursion DoS in parse() revive phase`
- The vulnerable package is pulled in through ESLint and `@typescript-eslint` tooling in the current lockfile
- Patched range: `>=3.4.0`

Interpretation:
- The Nest Fastify advisory affects shipped application dependencies and should be treated as the higher-priority dependency remediation item
- The `flatted` advisory currently appears in the development and linting toolchain path rather than the main runtime request path, but it is still a real high-severity advisory in the lockfile

Recommended remediation:
- Upgrade `@nestjs/platform-fastify` to `11.1.16` or later in both affected workspaces and regenerate the lockfile
- Update the ESLint / `@typescript-eslint` dependency chain so the resolved `flatted` version is `3.4.0` or later
- Rerun `pnpm audit --audit-level high` after the lockfile update and keep the result with this report

### D17. High: Observability endpoints are exposed without authentication and leak internal service topology and logs

Severity: High

Live evidence:
- `Prometheus` on `http://127.0.0.1:9090` responded without authentication
- `GET /api/v1/targets` returned internal scrape targets, including:
- `api:3000`
- `worker:3001`
- `realtime:3010`
- `Prometheus` on `http://127.0.0.1:9090/api/v1/query?query=up` returned live internal target inventory and health
- `Loki` on `http://127.0.0.1:3100` responded without authentication
- `GET /loki/api/v1/labels` returned available labels
- `GET /loki/api/v1/query_range?query={service="api"}&limit=5` returned live application logs without authentication
- `GET /loki/api/v1/query_range?query={service="worker"}&limit=5` returned live worker logs without authentication

Impact:
- Unauthenticated users who can reach these ports can enumerate internal services and scrape paths
- Unauthenticated users can query recent application and worker logs
- Those logs include request metadata such as paths, hostnames, remote addresses, and operational behavior that materially help post-compromise movement and reconnaissance

Recommended remediation:
- Do not expose Prometheus or Loki directly on unauthenticated host ports in shared or semi-trusted environments
- Bind them to localhost-only management paths, a private admin network, or place them behind authenticated reverse-proxy controls
- Minimize sensitive request metadata in logs if unauthenticated log access is ever possible

### D18. High: Grafana administrative access is reachable with the configured runtime credential

Severity: High

Live evidence:
- Grafana is exposed on `http://127.0.0.1:3002`
- Basic authentication to `GET /api/user` succeeded with:
- username: `admin`
- password: the configured `GRAFANA_ADMIN_PASSWORD` value from the running environment
- The authenticated session returned `isGrafanaAdmin: true`
- Authenticated requests also succeeded for:
- `GET /api/datasources`
- `GET /api/org`
- `GET /api/admin/settings`

Observed exposure:
- `GET /api/datasources` revealed live datasource connectivity to:
- `http://loki:3100`
- `http://prometheus:9090`
- `GET /api/admin/settings` exposed broad instance configuration and security posture details, including:
- `admin_user`
- authentication configuration
- SMTP disabled state
- public dashboard enablement
- internal filesystem and plugin settings

Interpretation:
- This is not a default-credential finding; `admin:admin` did not authenticate
- It is still a high-risk observability finding because the configured Grafana admin credential grants full administrative visibility into the monitoring plane
- In this lab, the admin password is also reused from another secret domain, increasing blast radius if one secret leaks

Recommended remediation:
- Rotate the Grafana admin password and stop reusing it across service boundaries
- Restrict Grafana to trusted management access only
- Consider disabling direct basic-auth exposure if a stronger front-door auth layer is available
- Review whether Grafana administrative endpoints are needed at all in this deployment profile

### D19. Informational: The app does not provide a machine-readable API specification

Severity: Informational

Observed:
- I did not find an OpenAPI, Swagger, AsyncAPI, or equivalent machine-readable service contract in the repo
- The implementation is documented in human-readable form across:
- `README.md`
- architecture and ADR documents
- security baseline and threat-model documents
- phase/status artifacts

Why this matters:
- A machine-readable spec improves reviewability of the exposed surface area
- It supports stronger client generation, contract testing, auth coverage validation, and change detection
- It reduces drift between implementation, documentation, and security review scope

Recommended remediation:
- Add an OpenAPI or Swagger specification for the API and keep it generated from code or validated in CI
- Include auth requirements, request/response schemas, error models, and admin-only route annotations
- If realtime or webhook contracts are part of the supported surface, document them in machine-readable form as well
- Treat spec generation and validation as part of the delivery baseline, not optional documentation

## Recommended Next Steps

1. Rotate `JWT_ACCESS_SECRET` and any reused secrets immediately, then invalidate existing bearer tokens.
2. Stop reusing secrets across JWT signing and infrastructure administration.
3. Revalidate real user state on privileged routes so signed claims alone do not grant durable admin access.
4. Require a real, active backing user before MFA enrollment or registration flows begin.
5. Decide whether same-org file metadata/search visibility is intended; if not, tighten it to owner or share-based access.
6. Remove secret fallbacks and fail startup when required secrets are missing.
7. Replace root-level Vault and MinIO credentials with least-privilege service credentials.
8. Enable fail-closed policy enforcement in non-development environments.
9. Add rate limiting and lockout controls for auth and public share endpoints.
10. Suppress `Server` disclosure on the HTTP redirect path if header minimization is part of the baseline.
11. Fix the local `pnpm`/`corepack` toolchain, then rerun `pnpm audit --audit-level high`.
12. Remove the profile-gated Docker socket mount from `promtail` before enabling observability in any shared or semi-trusted environment.
13. Apply the `api`/`worker` container hardening baseline more consistently across the remaining services.
14. Upgrade `@nestjs/platform-fastify` and the lint/tooling dependency chain, then rerun the dependency audit to clear the confirmed high-severity advisories.
15. Remove or lock down unauthenticated host exposure of Prometheus and Loki, and restrict Grafana to a trusted admin plane.
16. Add a machine-readable API specification such as OpenAPI/Swagger and validate it in CI so the exposed surface is explicit and reviewable.

## Apparent But Incomplete

This section captures areas that are present in the repo or deployment shape, but do not appear fully implemented as production-depth features yet.

- Email workflow surface appears only partial or preparatory. MailHog is wired into the stack, but I did not find a real application mail-sending feature such as invite, reset, verification, or notification delivery flows.
- Enterprise identity and policy integrations are present as optional wiring, not full always-on controls. `keycloak` and `opa` exist in the repo and compose profiles, but policy enforcement was disabled in the live app during testing and SSO appears to be a baseline shell rather than a full production identity integration.
- Search, preview/OCR, and DLP are implemented as staged expansion baselines, but are explicitly described by the repo as optional profile-driven depth areas rather than mature default runtime controls.
- Web and admin frontends exist, but much of the visible surface still reads as shell or baseline UI rather than a complete end-user product.
- Observability is present and functioning, but it is not hardened to production expectations. The services are live, but access control and Docker-socket hygiene are incomplete.
- Backup and restore are implemented as operator scripts and compose-side workflows, not as first-class application features exposed through the product UI or API.
- API documentation exists in human-readable form, but there is no machine-readable contract such as OpenAPI or Swagger to define the implemented surface precisely.
- MFA support is present and working in important paths, but the forged-principal testing exposed inconsistent handling across TOTP, WebAuthn, and audit persistence, which suggests the feature is implemented but not fully hardened across edge cases.

Interpretation:
- The repo is not empty or fake-featured; many of these capabilities are real.
- The more accurate characterization is that several surrounding platform features are scaffolded, optional, baseline-level, or insufficiently hardened rather than fully complete operational features.
