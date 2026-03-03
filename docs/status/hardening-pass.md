# Hardening Pass Status

- Status: Completed (Phase 0/1 scaffold hardening)
- Started: 2026-03-03
- Completed: 2026-03-03

## Summary

This pass focused on validation, hardening, and implementation-quality review of the current repository reality.

Key outcome:

- Infrastructure scaffold is significantly hardened and reproducible.
- Core secure file-sharing feature scope is still largely unimplemented and remains the primary blocker for prototype security handoff.

## Files Added/Changed

### Review artifacts

- `HARDENING_REVIEW.md`
- `SECURITY_FINDINGS.md`
- `docs/status/hardening-pass.md`

### Runtime and container hardening

- `.dockerignore`
- `apps/api/Dockerfile`
- `apps/worker/Dockerfile`
- `infra/compose/docker-compose.yml`
- `infra/caddy/Caddyfile`

### Bootstrap and operations scripts

- `infra/scripts/bootstrap.sh`
- `infra/scripts/seed-admin.sh`
- `infra/scripts/apply-prisma-migrations.sh`
- `infra/scripts/health.sh`
- `infra/scripts/backup.sh`
- `infra/scripts/restore-smoke.sh`

### Test and CI hardening

- `infra/scripts/tests/secrets-hygiene.sh`
- `infra/scripts/tests/bootstrap-scripts.sh`
- `infra/scripts/tests/hardening-baseline.sh` (added)
- `infra/scripts/tests/backup-restore-guards.sh` (added)
- `infra/scripts/tests/ops-reproducibility.sh`
- `Makefile`
- `package.json`
- `.github/workflows/ci.yml`

### Governance/doc accuracy updates

- `README.md`
- `docs/security-baseline.md`
- `docs/threat-model.md`
- `docs/data-model.md`
- `docs/runbooks/backup-and-restore.md`

## Commands Run

### Static and scaffold tests

- `bash infra/scripts/tests/phase0-structure.sh`
- `bash infra/scripts/tests/bootstrap-scripts.sh`
- `bash infra/scripts/tests/phase1-compose.sh`
- `bash infra/scripts/tests/secrets-hygiene.sh`
- `bash infra/scripts/tests/hardening-baseline.sh`
- `bash infra/scripts/tests/backup-restore-guards.sh`

### Compose and runtime validation

- `docker compose --env-file .env.example -f infra/compose/docker-compose.yml config > /dev/null`
- `./infra/scripts/health.sh`
- `BOOTSTRAP_ADMIN_PASSWORD_HASH='...' bash infra/scripts/tests/ops-reproducibility.sh` (multiple runs)

### Backup/restore validation

- `./infra/scripts/backup.sh` (multiple runs)
- `./infra/scripts/restore-smoke.sh` (multiple runs)
- `bash -x ./infra/scripts/restore-smoke.sh` (debug run)

### Containerized code-quality checks

- `docker compose ... exec -T api pnpm --filter @sfl/api lint`
- `docker compose ... exec -T api pnpm --filter @sfl/api typecheck`
- `docker compose ... exec -T api pnpm --filter @sfl/shared lint`
- `docker compose ... exec -T api pnpm --filter @sfl/shared typecheck`
- `docker compose ... exec -T worker pnpm --filter @sfl/worker lint`
- `docker compose ... exec -T worker pnpm --filter @sfl/worker typecheck`

### Environment constraint validation

- `pnpm install --no-frozen-lockfile` on host (failed due DNS/network restrictions to npm registry in this environment).

## Tests Added

- `infra/scripts/tests/hardening-baseline.sh`
  - Enforces compose runtime hardening expectations.
  - Enforces pinned image tag expectations and amd64 platform pinning checks.
  - Enforces Caddy hardening header presence.
  - Enforces bootstrap/admin-seed guardrail strings.
  - Enforces backup/restore safety control strings.

- `infra/scripts/tests/backup-restore-guards.sh`
  - Negative tests for restore-smoke failure behavior:
    - no backup directory
    - missing `postgres.sql`
    - missing `manifest.json`
    - missing `minio/`

## Test Results

Passing:

- All scaffold/hardening shell tests listed above.
- Compose configuration validation.
- Repeated destructive reproducibility checks (`ops-reproducibility.sh`).
- Repeated backup generation and restore smoke runs.
- Containerized lint and typecheck for `api`, `worker`, and `shared`.

Failed/Constrained:

- Host dependency install blocked by external DNS/network (`ENOTFOUND registry.npmjs.org`).
- In-container Vitest execution under hardened read-only runtime remains constrained by Vite temp-path behavior.

## Assumptions Made

- This repository currently represents Phase 0/1 scaffold capability, not full secure-file-sharing implementation.
- Local prototype operator controls `.env` and compose runtime in a trusted environment.
- Vault dev mode remains acceptable for this scaffold stage.

## Deferred Items and Why

1. Auth/session/file/share/audit domain implementation
- Reason: large missing feature scope beyond hardening pass; tracked as critical deferred work.

2. Full workflow-level restore validation (login/list/download/share)
- Reason: corresponding application workflows are not implemented.

3. In-container test execution under read-only runtime
- Reason: preserving runtime hardening took precedence; recommend separate writable test profile if needed.

4. Strict non-executing `.env` parser in scripts
- Reason: moderate effort and currently accepted local-trust assumption for scaffold stage.

## Overall Recommendation

- No-Go for secure file-sharing prototype handoff.
- Go for hardened Phase 0/1 infrastructure scaffold handoff.
