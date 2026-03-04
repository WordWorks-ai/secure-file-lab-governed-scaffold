# Phase 03 Status - Authentication and Authorization

- Status: Completed
- Started: 2026-03-04
- Completed: 2026-03-04

## Summary

Phase 3 implemented runtime authentication and baseline authorization controls:

- Auth endpoints implemented:
  - `POST /v1/auth/login`
  - `POST /v1/auth/refresh`
  - `POST /v1/auth/logout`
  - `GET /v1/auth/me`
  - `GET /v1/auth/admin-check`
- JWT access token issuance and verification baseline implemented.
- Rotating refresh-token lifecycle implemented (create, rotate, revoke, replay denial).
- RBAC baseline guards implemented for `admin` and `member` roles.
- Runtime auth audit event emission implemented for login/refresh/logout outcomes.
- Auth e2e tests added to validate token lifecycle and role enforcement.

## Files Added/Changed

### Auth runtime

- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/auth.module.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/jwt-token.service.ts`
- `apps/api/src/modules/auth/decorators/roles.decorator.ts`
- `apps/api/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/api/src/modules/auth/guards/roles.guard.ts`
- `apps/api/src/modules/auth/dto/login.dto.ts`
- `apps/api/src/modules/auth/dto/refresh.dto.ts`
- `apps/api/src/modules/auth/dto/logout.dto.ts`
- `apps/api/src/modules/auth/types/authenticated-request.ts`

### Audit runtime

- `apps/api/src/modules/audit/audit.service.ts`

### System metadata and tests

- `apps/api/src/modules/system/system.controller.ts`
- `apps/api/test/system.e2e.test.ts`
- `apps/api/test/auth.e2e.test.ts`

### Governance/status updates

- `README.md`
- `docs/security-baseline.md`
- `docs/threat-model.md`
- `infra/scripts/tests/phase0-structure.sh`
- `infra/scripts/tests/scope-accuracy.sh`
- `docs/status/phase-03.md`

## Commands Run

- `DOCKER_BUILDKIT=0 docker compose --env-file .env -f infra/compose/docker-compose.yml up -d --build api`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T api pnpm --filter @sfl/api lint`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T api pnpm --filter @sfl/api typecheck`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T api pnpm --filter @sfl/api test`
- `bash infra/scripts/tests/phase0-structure.sh`
- `bash infra/scripts/tests/scope-accuracy.sh`

## Tests Added

- `apps/api/test/auth.e2e.test.ts`

## Test Results

- `@sfl/api` lint: pass
- `@sfl/api` typecheck: pass
- `@sfl/api` test: pass (`11` tests across health/system/auth suites)
- Scope and structure checks: pass

## Assumptions Made

- JWT baseline uses HS256 with environment-provided secrets suitable for prototype scope.
- Auth audit write failures are logged and do not block auth control flow in prototype mode.

## Deferred Items and Why

- MFA, external SSO, and advanced identity controls are out of current v1 scope.
- Authorization enforcement for file/share/org domain operations is deferred to file/share phases.
- File pipeline, malware queue gate, and full non-auth audit coverage are deferred to later phases.
