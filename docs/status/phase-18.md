# Phase 18 Status - Preview/OCR Hardening Baseline

- Status: Completed (hardening baseline)
- Started: 2026-03-04
- Completed: 2026-03-04

## Summary

Stage 18 hardened the content-derivation path for preview/OCR artifacts:

- Added bounded payload extraction guardrails for content derivatives.
- Added stronger text normalization and binary-safe printable fallback extraction.
- Added explicit retry audit events for non-terminal content processing failures.
- Added terminal fail-closed behavior to block active files when content processing exhausts retries.
- Added configurable content-job backoff delay and fail-closed controls via environment.

## Files Added/Changed

- `apps/worker/src/modules/jobs/services/worker-content-derivatives.service.ts`
- `apps/worker/src/modules/jobs/jobs.service.ts`
- `apps/worker/test/jobs.service.test.ts`
- `apps/worker/test/worker-content-derivatives.service.test.ts`
- `apps/api/src/modules/files/file-lifecycle-rules.ts`
- `.env.example`
- `infra/compose/docker-compose.yml`
- `infra/scripts/tests/stage18-content-hardening.sh`
- `infra/scripts/tests/phase0-structure.sh`
- `package.json`
- `Makefile`
- `.github/workflows/ci.yml`
- `apps/api/src/modules/system/system.controller.ts`
- `apps/api/test/system.e2e.test.ts`
- `IMPLEMENTATION_PLAN.md`
- `README.md`
- `docs/architecture-service-map.md`
- `docs/runbooks/getting-started.md`
- `docs/security-baseline.md`
- `docs/threat-model.md`
- `docs/status/phase-18.md`

## Validation Targets

- Worker unit tests verify:
  - non-terminal retry audit behavior (`file.content.retry`)
  - terminal fail-closed block behavior (`file.content.blocked`)
  - fail-closed opt-out path
- Derivative service unit tests verify normalization, fallback extraction, and payload bounds.
- Stage 18 scaffold checks are wired into `test:scaffold`, Makefile, and CI.

## Notes

- Fail-closed content behavior is enabled by default via `CONTENT_PIPELINE_FAIL_CLOSED=true`.
- Content retry delay is configurable with `CONTENT_JOB_BACKOFF_DELAY_MS`.
- Derivative extraction byte bounds are controlled via `CONTENT_DERIVATIVES_MAX_BYTES`.
