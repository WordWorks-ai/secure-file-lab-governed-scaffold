# Phase 14 Status - Observability and Final Handoff Baseline

- Status: Completed (baseline shell)
- Started: 2026-03-04
- Completed: 2026-03-04

## Summary

Stage 14 introduced an optional observability profile and baseline telemetry wiring:

- Added optional compose `observability` profile services:
  - `prometheus`
  - `grafana`
  - `loki`
  - `promtail`
- Added API and worker Prometheus metrics endpoints:
  - `GET /v1/metrics`
- Added realtime metrics endpoint:
  - `GET /metrics`
- Added observability config artifacts for scraping and centralized log shipping.
- Added Stage 14 scaffold checks and final status/doc updates.

## Files Added/Changed

- `apps/api/src/modules/metrics/metrics.module.ts`
- `apps/api/src/modules/metrics/metrics.controller.ts`
- `apps/api/src/app.module.ts`
- `apps/api/test/health.e2e.test.ts`
- `apps/worker/src/modules/metrics/metrics.module.ts`
- `apps/worker/src/modules/metrics/metrics.controller.ts`
- `apps/worker/src/worker.module.ts`
- `apps/worker/test/health.e2e.test.ts`
- `apps/realtime/server.mjs`
- `infra/observability/prometheus.yml`
- `infra/observability/loki-config.yml`
- `infra/observability/promtail-config.yml`
- `infra/observability/grafana/provisioning/datasources/datasources.yml`
- `infra/compose/docker-compose.yml`
- `.env.example`
- `infra/scripts/tests/stage14-observability.sh`
- `infra/scripts/tests/phase0-structure.sh`
- `package.json`
- `Makefile`
- `.github/workflows/ci.yml`
- `apps/api/src/modules/system/system.controller.ts`
- `apps/api/test/system.e2e.test.ts`
- `README.md`
- `docs/architecture-service-map.md`
- `docs/runbooks/getting-started.md`
- `docs/status/phase-14.md`

## Validation Targets

- Observability profile compose wiring validates for Prometheus/Grafana/Loki/Promtail.
- Stage 14 scaffold checks pass.
- API and worker metrics endpoint tests pass.
- Existing unit/integration/scaffold suites remain green.

## Notes

- Observability stack remains opt-in via `--profile observability`.
- Baseline metrics are lightweight service/process indicators intended for local prototype visibility.
