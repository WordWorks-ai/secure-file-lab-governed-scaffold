# Phase 04 Status - File Ingest, Storage, and Encryption

- Status: Completed
- Started: 2026-03-04
- Completed: 2026-03-04

## Summary

Phase 4 implemented the file ingest and encryption runtime baseline:

- File API endpoints added:
  - `POST /v1/files/upload`
  - `GET /v1/files/:fileId`
  - `GET /v1/files/:fileId/download`
  - `POST /v1/files/:fileId/activate` (admin-only prototype gate for controlled activation)
- Upload path enforces type/size validation and stores encrypted payload in MinIO.
- Per-file DEK generation implemented with AES-256-GCM encryption.
- Vault transit wrap/unwrap integration implemented for DEK handling.
- Lifecycle progression enforced from `created -> stored -> quarantined -> scan_pending`.
- Download path enforces active-only gate and decrypts only after authorization + status checks.
- File workflow audit events added for upload, persistence, queueing, activation, and download outcomes.

## Files Added/Changed

### File runtime module

- `apps/api/src/modules/files/files.controller.ts`
- `apps/api/src/modules/files/files.module.ts`
- `apps/api/src/modules/files/files.service.ts`
- `apps/api/src/modules/files/file-crypto.service.ts`
- `apps/api/src/modules/files/file-lifecycle-rules.ts`
- `apps/api/src/modules/files/minio-object-storage.service.ts`
- `apps/api/src/modules/files/vault-transit.service.ts`
- `apps/api/src/modules/files/dto/upload-file.dto.ts`

### File workflow tests

- `apps/api/test/files.e2e.test.ts`
- `apps/api/test/system.e2e.test.ts`

### Supporting updates

- `apps/api/src/modules/system/system.controller.ts`
- `apps/api/src/modules/auth/auth.module.ts`
- `apps/api/src/modules/audit/audit.service.ts`
- `.env.example`
- `README.md`
- `docs/security-baseline.md`
- `docs/threat-model.md`
- `infra/scripts/tests/phase0-structure.sh`
- `infra/scripts/tests/scope-accuracy.sh`
- `docs/status/phase-04.md`

## Commands Run

- `DOCKER_BUILDKIT=0 docker compose --env-file .env -f infra/compose/docker-compose.yml up -d --build api`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T api pnpm --filter @sfl/api lint`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T api pnpm --filter @sfl/api typecheck`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T api pnpm --filter @sfl/api test`
- `bash infra/scripts/tests/phase0-structure.sh`
- `bash infra/scripts/tests/scope-accuracy.sh`

## Tests Added

- `apps/api/test/files.e2e.test.ts`

## Test Results

- `@sfl/api` lint: pass
- `@sfl/api` typecheck: pass
- `@sfl/api` test: pass (`15` tests across health/system/auth/files suites)
- Scope and structure checks: pass

## Assumptions Made

- File upload API uses JSON base64 payloads for prototype simplicity; multipart streaming remains a future enhancement.
- Activation endpoint is admin-gated prototype control until worker malware pipeline (Phase 5) automates clean/infected transitions.

## Deferred Items and Why

- Worker-driven malware scanning and automatic `scan_pending -> active/blocked` transitions are Phase 5 scope.
- Share-policy coupling and org-boundary share controls remain Phase 6 scope.
- Full async audit query/export behavior remains Phase 6+ scope.
