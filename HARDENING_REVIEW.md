# Hardening Review

## Executive Assessment

- Assessment date: 2026-03-03
- Overall state: **Infrastructure scaffold is materially hardened**, but **core secure file-sharing application capabilities are not implemented**.
- Handoff judgment:
  - **No-Go** for secure file sharing prototype handoff (auth/file/share/audit workflow scope is not present).
  - **Go** for Phase 0/1 governed infrastructure scaffold handoff (compose/bootstrap/backup smoke).

## Validation Scope Executed

Validated directly from code, runtime behavior, and scripts:

- Architecture alignment versus intended v1 shape.
- Compose topology, health checks, bootstrap determinism, and idempotency.
- Backup generation and restore smoke behavior.
- Container/runtime hardening controls.
- Governance/docs-to-code consistency.
- Shell-based quality/security checks and CI scaffolding.

## Findings By Severity

### Critical

1. Core security workflow is not implemented (auth/session, file ingest/encryption, scan gate, shares, audit emission)

- Impact:
  - System cannot enforce intended security model for real secure file sharing.
  - Security controls are mostly design intent, not runtime guarantees.
- Evidence:
  - API module surface is only health/system: `apps/api/src/app.module.ts`, `apps/api/src/modules/health/*`, `apps/api/src/modules/system/*`.
  - No auth/files/shares/audit API modules found under `apps/api/src/modules`.
  - Worker job processing is placeholder-only: `apps/worker/src/modules/jobs/jobs.service.ts` (log explicitly says queue processors are Phase 5).
  - No BullMQ/scan/expiration/cleanup implementation symbols in worker code.
  - Prisma schema contains only `User`, `BootstrapState`, `AuditEvent`: `apps/api/prisma/schema.prisma`.
  - Tests cover only health + shared lifecycle helper: `apps/api/test/health.e2e.test.ts`, `apps/worker/test/health.e2e.test.ts`, `packages/shared/test/file-lifecycle.test.ts`.
- Remediation status:
  - **Deferred (large)**. Requires implementation of Phases 2-6 capabilities.

2. Security baseline documentation previously over-represented implemented controls

- Impact:
  - Governance risk: readers may assume controls exist that are not implemented.
- Evidence:
  - Prior docs claimed JWT rotation/RBAC/file encryption/scan gate/share policy as baseline while code lacked corresponding modules/flows.
- Remediation status:
  - **Fixed in this pass** via explicit status notes and implemented-vs-target language updates:
    - `README.md`
    - `docs/security-baseline.md`
    - `docs/threat-model.md`
    - `docs/data-model.md`
    - `docs/runbooks/backup-and-restore.md`

### High

1. Restore smoke reliability was intermittent under startup timing

- Impact:
  - False negative restore outcomes in slower environments.
- Evidence:
  - Intermittent `temporary postgres did not become ready` during repeated runs.
- Remediation status:
  - **Fixed**:
    - Added configurable wait window and timeout diagnostics (`SMOKE_DB_WAIT_SECONDS`, container logs on timeout): `infra/scripts/restore-smoke.sh`.

2. Backup retention cleanup lacked explicit path safety guardrails

- Impact:
  - Misconfigured `BACKUP_ROOT` could cause unsafe deletion scope.
- Evidence:
  - Retention path cleanup used `rm -rf` over discovered directories without validating backup-root resolution.
- Remediation status:
  - **Fixed**:
    - Added guardrails to reject `/` and enforce `OUT_DIR` within `BACKUP_ROOT`: `infra/scripts/backup.sh`.

3. Admin seed bootstrap hardening gaps

- Impact:
  - Risk of weak/placeholder admin seed value acceptance or unsafe SQL interpolation patterns.
- Evidence:
  - Seed flow needed stronger guardrails and strict variable handling.
- Remediation status:
  - **Fixed**:
    - Enforced Argon2id hash-format checks and placeholder rejection.
    - Added email-format validation.
    - Used `psql -v` values with variable interpolation (`:'admin_email'`, `:'admin_password_hash'`): `infra/scripts/seed-admin.sh`, `infra/scripts/bootstrap.sh`.

4. Runtime hardening controls were incomplete

- Impact:
  - Weaker container isolation defaults.
- Evidence:
  - API/worker lacked hardened runtime settings initially.
- Remediation status:
  - **Fixed**:
    - `user: 'node'`, `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges:true`, `tmpfs: /tmp`, `init: true`: `infra/compose/docker-compose.yml`.
    - Dockerfiles run as non-root with `NODE_ENV=production`: `apps/api/Dockerfile`, `apps/worker/Dockerfile`.

### Medium

1. In-container Vitest execution conflicts with read-only runtime model

- Impact:
  - `pnpm --filter <pkg> test` in running api/worker containers fails due Vite temp writes under package `node_modules` paths.
- Evidence:
  - Errors creating `node_modules/.vite-temp` when running vitest inside read-only containers.
- Remediation status:
  - **Deferred**:
    - Kept runtime hardening intact (fail-safe preference) and documented limitation.
    - CI still runs tests on writable runners.

2. Caddy healthcheck is shallow

- Impact:
  - Current healthcheck verifies `caddy version`, not request-path behavior.
- Evidence:
  - `caddy` service healthcheck uses `caddy version`: `infra/compose/docker-compose.yml`.
- Remediation status:
  - **Deferred**:
    - Caddy route correctness is indirectly checked by `infra/scripts/health.sh` curls through Caddy.

3. `.env` sourcing pattern executes shell syntax from env files

- Impact:
  - If `.env` is untrusted, scripts may execute unintended shell expressions.
- Evidence:
  - Multiple scripts use `source "$ROOT_DIR/.env"`.
- Remediation status:
  - **Deferred** (prototype threat model assumes trusted local operator).

### Low

1. Docker BuildKit instability in this environment

- Impact:
  - Build reproducibility hiccups (`x-docker-expose-session-sharedkey`) in this workspace context.
- Evidence:
  - Intermittent BuildKit errors during compose builds.
- Remediation status:
  - **Mitigated** by using `DOCKER_BUILDKIT=0` in bootstrap and reproducibility scripts.

## Remediation Implemented In This Pass

- Added `.dockerignore` with secret/build-context hygiene exclusions.
- Hardened API/worker runtime security options in compose.
- Added Caddy hardening headers (`nosniff`, `DENY`, `no-referrer`, restrictive permissions policy, removed `Server`).
- Added deterministic bootstrap env validation and stricter admin seed controls.
- Replaced runtime `pnpm` migration dependency with SQL migration applier script for read-only/non-root compatibility.
- Strengthened health script to fail if readiness endpoint fails.
- Improved backup artifact integrity (checksums + manifest + retention metadata).
- Hardened backup retention deletion scope checks.
- Upgraded restore smoke to validate required artifacts, execute real DB restore, verify checksums, and improve timeout diagnostics.
- Added shell hardening tests and CI wiring:
  - `infra/scripts/tests/hardening-baseline.sh`
  - `infra/scripts/tests/backup-restore-guards.sh`
- Added mailhog platform pinning for deterministic Apple Silicon behavior.

## Tests Added Or Improved

Added:

- `infra/scripts/tests/hardening-baseline.sh`
- `infra/scripts/tests/backup-restore-guards.sh`

Expanded:

- `infra/scripts/tests/bootstrap-scripts.sh` now checks new hardening test scripts.
- `Makefile` targets include hardening checks.
- `package.json` scripts include hardening checks.
- `.github/workflows/ci.yml` scaffold stage includes hardening and backup/restore guard tests.

## Validation Results (This Pass)

Passing:

- Compose validation: `docker compose --env-file .env.example -f infra/compose/docker-compose.yml config`
- Shell scaffold tests:
  - `phase0-structure.sh`
  - `bootstrap-scripts.sh`
  - `phase1-compose.sh`
  - `secrets-hygiene.sh`
  - `hardening-baseline.sh`
  - `backup-restore-guards.sh`
- Operational reproducibility (destructive): `ops-reproducibility.sh` passed repeatedly.
- Runtime health: `infra/scripts/health.sh` passed.
- Backup + restore smoke:
  - `infra/scripts/backup.sh` passed.
  - `infra/scripts/restore-smoke.sh` passed against latest artifact.
- Targeted lint/typecheck in containers:
  - API/shared/worker lint pass.
  - API/shared/worker typecheck pass.

Constrained/Not fully executable in this environment:

- Host `pnpm install` blocked by DNS/network restrictions to npm registry.
- Full Vitest execution inside hardened running containers remains incompatible with read-only runtime filesystem behavior.

## Remaining Risks

- Prototype feature scope (auth/file/share/scan/audit runtime flows) is largely unimplemented.
- Backup/restore smoke verifies DB restore path but does not yet restore MinIO objects into running environment workflows.
- Vault remains dev-mode for local prototype bootstrap.

## Final Recommendation

- **No-Go** for secure-file-sharing prototype handoff as a feature-complete/security-complete system.
- **Go** for handing off a hardened, deterministic Phase 0/1 infrastructure scaffold with explicit governance and validated bootstrap/recoverability mechanics.
- Recommended next slice before reconsidering handoff: implement Phase 2/3 minimum (auth + persistence boundaries) with end-to-end tests.
