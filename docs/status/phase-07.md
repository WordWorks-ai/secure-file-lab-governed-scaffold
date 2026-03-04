# Phase 07 Status - Backup, Restore, and Operational Readiness

- Status: Completed
- Started: 2026-03-04
- Completed: 2026-03-04

## Summary

Phase 7 completed operational backup/restore readiness:

- Added destructive live restore workflow for compose `postgres` + `minio` with explicit confirmation and path-safety checks.
- Added destructive reset workflow with optional pre-reset backup and optional clean rebuild bootstrap path.
- Expanded runbooks for backup/restore, reset/bootstrap/restore operations, and Vault recovery constraints.
- Extended guard tests, scaffold checks, and CI wiring for Phase 7 scripts/docs.

## Files Added/Changed

### Operational scripts

- `infra/scripts/restore-live.sh`
- `infra/scripts/reset.sh`

### Guard and scaffold tests

- `infra/scripts/tests/restore-live-guards.sh`
- `infra/scripts/tests/bootstrap-scripts.sh`
- `infra/scripts/tests/hardening-baseline.sh`
- `infra/scripts/tests/phase0-structure.sh`
- `infra/scripts/tests/scope-accuracy.sh`

### Tooling and CI wiring

- `Makefile`
- `package.json`
- `.github/workflows/ci.yml`

### Runtime/system status update

- `apps/api/src/modules/system/system.controller.ts`
- `apps/api/test/system.e2e.test.ts`

### Runbooks and governance docs

- `README.md`
- `docs/security-baseline.md`
- `docs/threat-model.md`
- `docs/runbooks/backup-and-restore.md`
- `docs/runbooks/bootstrap.md`
- `docs/runbooks/local-development.md`
- `docs/runbooks/getting-started.md`
- `docs/runbooks/reset-bootstrap-restore.md`
- `docs/runbooks/vault-recovery.md`
- `docs/status/phase-07.md`

## Commands Run

- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T api pnpm --filter @sfl/api lint`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T api pnpm --filter @sfl/api typecheck`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T api pnpm --filter @sfl/api test`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T worker pnpm --filter @sfl/worker lint`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T worker pnpm --filter @sfl/worker typecheck`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T worker pnpm --filter @sfl/worker test`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T api pnpm --filter @sfl/shared lint`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T api pnpm --filter @sfl/shared typecheck`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T api pnpm --filter @sfl/shared test`
- `bash infra/scripts/tests/phase0-structure.sh`
- `bash infra/scripts/tests/bootstrap-scripts.sh`
- `bash infra/scripts/tests/phase1-compose.sh`
- `bash infra/scripts/tests/secrets-hygiene.sh`
- `bash infra/scripts/tests/env-loader-safety.sh`
- `bash infra/scripts/tests/scope-accuracy.sh`
- `bash infra/scripts/tests/backup-restore-guards.sh`
- `bash infra/scripts/tests/restore-live-guards.sh`
- `bash infra/scripts/tests/hardening-baseline.sh`
- `make compose-validate`
- `make backup`
- `make restore-smoke`
- `RESTORE_CONFIRM=YES make restore-live`

## Tests Added

- `infra/scripts/tests/restore-live-guards.sh`
  - destructive confirmation required for live restore
  - `BACKUP_ROOT=/` guard enforcement
  - `BACKUP_DIR` confinement to `BACKUP_ROOT`
  - required backup artifact presence checks before docker execution

## Test Results

- `@sfl/api` lint/typecheck/test: pass
- `@sfl/worker` lint/typecheck/test: pass
- `@sfl/shared` lint/typecheck/test: pass
- Scaffold/hardening/guard shell checks: pass
- `make backup`, `make restore-smoke`, and `RESTORE_CONFIRM=YES make restore-live`: pass

## Assumptions Made

- Prototype operators run destructive reset/restore actions intentionally with explicit confirmation env vars.
- Vault recovery remains documentation-first in v1; production key custody is deferred.
- Host Node 20 / missing workspace `node_modules` may block host-side pnpm tooling, so quality checks are executed in compose containers.

## Deferred Items and Why

- Dependency audit/secret-scanning CI expansion and final handoff service map remain Phase 8 scope per implementation plan.
