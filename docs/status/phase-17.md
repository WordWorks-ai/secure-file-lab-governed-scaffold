# Phase 17 Status - Realtime WebSocket Transport Baseline

- Status: Completed (baseline shell)
- Started: 2026-03-04
- Completed: 2026-03-04

## Summary

Stage 17 upgraded realtime transport from SSE-only baseline to authenticated WebSocket support:

- Added JWT-authenticated WebSocket upgrades at `GET /ws` (upgrade path).
- Added dual broadcast fan-out to SSE and WebSocket subscribers.
- Added realtime auth gate for stream/upgrade entrypoints using JWT access tokens.
- Added WebSocket metrics for active and total connections.
- Added deterministic realtime auth/delivery test coverage via raw-socket Node integration test.

## Files Added/Changed

- `apps/realtime/server.mjs`
- `apps/realtime/test/websocket-auth-delivery.test.mjs`
- `infra/compose/docker-compose.yml`
- `.env.example`
- `infra/scripts/tests/stage17-realtime-websocket.sh`
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
- `docs/status/phase-17.md`

## Validation Targets

- Realtime WebSocket auth/delivery integration tests pass.
- Stage 17 scaffold checks pass and are included in CI scaffold gate.
- Existing lint/typecheck/unit/integration/scaffold suites remain green.

## Notes

- WebSocket auth currently validates JWT access tokens with HS256 signature checks.
- SSE path remains available; both SSE and WebSocket clients receive publish fan-out events.
