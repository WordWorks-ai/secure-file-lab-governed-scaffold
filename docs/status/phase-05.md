# Phase 05 Status - Worker, Queue, Malware Scan Gate

- Status: Completed
- Started: 2026-03-04
- Completed: 2026-03-04

## Summary

Phase 5 implemented the asynchronous malware-gate workflow and worker lifecycle jobs:

- API file uploads now enqueue BullMQ scan jobs (`file-scan` queue).
- Worker scan processor now:
  - reads encrypted object from MinIO
  - unwraps DEK via Vault transit
  - decrypts payload and scans via ClamAV
  - transitions `scan_pending -> active` when clean
  - transitions `scan_pending -> blocked` on infected or terminal scan failure
- Retry behavior is fail-closed on final attempt.
- Worker maintenance jobs now transition:
  - `active -> expired` for files past expiry
  - `expired -> deleted` after retention cutoff
- Async audit events were added for scan completion and lifecycle sweeps.

## Files Added/Changed

### API queue producer

- `apps/api/src/modules/files/file-queue.contract.ts`
- `apps/api/src/modules/files/file-queue.service.ts`
- `apps/api/src/modules/files/files.module.ts`
- `apps/api/src/modules/files/files.service.ts`
- `apps/api/test/files.e2e.test.ts`

### Worker runtime

- `apps/worker/src/modules/jobs/jobs.module.ts`
- `apps/worker/src/modules/jobs/jobs.service.ts`
- `apps/worker/src/modules/jobs/contracts/file-jobs.contract.ts`
- `apps/worker/src/modules/jobs/services/clamav-scanner.service.ts`
- `apps/worker/src/modules/jobs/services/worker-file-crypto.service.ts`
- `apps/worker/src/modules/jobs/services/worker-minio-object-storage.service.ts`
- `apps/worker/src/modules/jobs/services/worker-vault-transit.service.ts`
- `apps/worker/src/modules/persistence/prisma.module.ts`
- `apps/worker/src/modules/persistence/prisma.service.ts`
- `apps/worker/src/modules/audit/audit.module.ts`
- `apps/worker/src/modules/audit/audit.service.ts`
- `apps/worker/test/jobs.service.test.ts`
- `apps/worker/test/health.e2e.test.ts`

### Dependency and build updates

- `apps/api/package.json`
- `apps/worker/package.json`
- `pnpm-lock.yaml`
- `apps/worker/Dockerfile`

### Config, validation, and governance docs

- `.env.example`
- `infra/compose/docker-compose.yml`
- `infra/scripts/tests/phase0-structure.sh`
- `infra/scripts/tests/scope-accuracy.sh`
- `README.md`
- `docs/security-baseline.md`
- `docs/threat-model.md`
- `docs/status/phase-05.md`

## Commands Run

- `DOCKER_BUILDKIT=0 docker compose --env-file .env -f infra/compose/docker-compose.yml up -d --build api worker`
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
- `bash infra/scripts/tests/scope-accuracy.sh`

## Tests Added

- `apps/worker/test/jobs.service.test.ts`
  - clean vs infected transitions
  - idempotent processing for non-`scan_pending` files
  - retry/terminal-failure behavior
  - expiration and cleanup sweep behavior

## Test Results

- `@sfl/api` lint/typecheck/test: pass
- `@sfl/worker` lint/typecheck/test: pass
- `@sfl/shared` lint/typecheck/test: pass
- Scope and structure checks: pass

## Assumptions Made

- Admin-only manual activation endpoint remains available for controlled prototype operations, even though worker automation now handles normal scan transitions.
- Cleanup retention uses `expiresAt` with `FILE_EXPIRED_RETENTION_SECONDS` as the deletion cutoff baseline.

## Deferred Items and Why

- Share-link runtime policy and org-boundary share enforcement remain Phase 6 scope.
- Audit query/export endpoints remain Phase 6 scope.
