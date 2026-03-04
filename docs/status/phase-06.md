# Phase 06 Status - Share Links, Access Control, and Audit Completeness

- Status: Completed
- Started: 2026-03-04
- Completed: 2026-03-04

## Summary

Phase 6 implemented share-link runtime controls, org-boundary authorization, and audit query/export APIs:

- Share runtime endpoints added:
  - `POST /v1/shares` (create share token with expiry, optional password, optional max downloads)
  - `POST /v1/shares/:shareId/revoke` (revoke share link)
  - `POST /v1/shares/access` (public share access with policy checks)
- Share policy enforcement added:
  - org membership checks for share management
  - owner/admin management permissions
  - expiry, revocation, password, and max-download enforcement
  - active-file-only share access
- Audit query/export baseline added:
  - `GET /v1/audit/events` (admin-gated filtered query)
  - `GET /v1/audit/events/export` (admin-gated NDJSON export)

## Files Added/Changed

### Share runtime

- `apps/api/src/modules/shares/shares.module.ts`
- `apps/api/src/modules/shares/shares.controller.ts`
- `apps/api/src/modules/shares/shares.service.ts`
- `apps/api/src/modules/shares/dto/create-share.dto.ts`
- `apps/api/src/modules/shares/dto/access-share.dto.ts`

### Audit query/export

- `apps/api/src/modules/audit/audit.module.ts`
- `apps/api/src/modules/audit/audit.controller.ts`
- `apps/api/src/modules/audit/audit.service.ts`
- `apps/api/src/modules/audit/dto/query-audit-events.dto.ts`

### Tests

- `apps/api/test/shares.e2e.test.ts`
- `apps/api/test/system.e2e.test.ts`

### Governance/docs/status updates

- `apps/api/src/modules/system/system.controller.ts`
- `README.md`
- `docs/security-baseline.md`
- `docs/threat-model.md`
- `infra/scripts/tests/phase0-structure.sh`
- `infra/scripts/tests/scope-accuracy.sh`
- `docs/status/phase-06.md`

## Commands Run

- `DOCKER_BUILDKIT=0 docker compose --env-file .env -f infra/compose/docker-compose.yml up -d --build api`
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

- `apps/api/test/shares.e2e.test.ts`
  - share creation with expiry/password/max-download controls
  - org-boundary enforcement for share management
  - revocation behavior
  - admin-gated audit query/export behavior

## Test Results

- `@sfl/api` lint/typecheck/test: pass
- `@sfl/worker` lint/typecheck/test: pass
- `@sfl/shared` lint/typecheck/test: pass
- Scope and structure checks: pass

## Assumptions Made

- Share creation is restricted to org admins or file owners.
- Audit query/export baseline is admin-only and returns recent, filterable records.

## Deferred Items and Why

- Backup/restore operational readiness and recovery guidance remain Phase 7 scope.
- CI-quality and handoff-polish controls remain Phase 8 scope.
