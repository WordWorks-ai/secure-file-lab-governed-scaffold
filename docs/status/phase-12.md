# Phase 12 Status - Preview and OCR Pipeline Baseline

- Status: Completed (baseline shell)
- Started: 2026-03-04
- Completed: 2026-03-04

## Summary

Stage 12 introduced a baseline content-derivation pipeline for preview and OCR artifacts:

- Added optional compose `content` profile services:
  - `preview`
  - `ocr`
- Added API content queue producer and artifact retrieval endpoint:
  - `GET /v1/files/:fileId/artifacts`
- Added worker content queue consumer and derivative generation service.
- Added persisted artifact metadata model linked 1:1 to files (`file_artifacts`).
- Wired file activation/scan flows to enqueue content processing.

## Files Added/Changed

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260304160000_phase12_file_artifacts/migration.sql`
- `apps/api/src/modules/files/content-queue.contract.ts`
- `apps/api/src/modules/files/content-queue.service.ts`
- `apps/api/src/modules/files/files.controller.ts`
- `apps/api/src/modules/files/files.module.ts`
- `apps/api/src/modules/files/files.service.ts`
- `apps/api/test/files.e2e.test.ts`
- `apps/worker/src/modules/jobs/contracts/content-jobs.contract.ts`
- `apps/worker/src/modules/jobs/services/worker-content-derivatives.service.ts`
- `apps/worker/src/modules/jobs/jobs.module.ts`
- `apps/worker/src/modules/jobs/jobs.service.ts`
- `apps/worker/test/jobs.service.test.ts`
- `apps/preview/server.mjs`
- `apps/ocr/server.mjs`
- `infra/compose/docker-compose.yml`
- `.env.example`
- `infra/scripts/tests/stage12-content.sh`
- `infra/scripts/tests/phase0-structure.sh`
- `package.json`
- `Makefile`
- `.github/workflows/ci.yml`
- `apps/api/src/modules/system/system.controller.ts`
- `apps/api/test/system.e2e.test.ts`
- `README.md`
- `docs/architecture-service-map.md`
- `docs/runbooks/getting-started.md`
- `docs/status/phase-12.md`

## Validation Targets

- Content profile compose wiring validates for `preview` and `ocr` services.
- Stage 12 scaffold checks pass.
- API tests cover artifact endpoint shape and content queue enqueue on activation.
- Worker unit tests cover content artifact generation and terminal failure audit path.

## Notes

- Content pipeline remains opt-in via `CONTENT_PIPELINE_ENABLED=true` and `--profile content`.
- Preview/OCR services are baseline shells in this stage; richer converters/extractors are deferred.
