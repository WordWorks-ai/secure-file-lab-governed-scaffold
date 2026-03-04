# Architecture and Service Map (v1 Prototype)

## Purpose

Provide an operator-facing map of services, trust boundaries, and runtime dependencies for the Phase 8 handoff plus post-v1 expansion baselines.

## Service Topology

Core compose services:

- `caddy` - edge ingress and local TLS termination.
- `api` - NestJS modular monolith for auth, file, share, audit APIs.
- `worker` - NestJS async processor for malware scans and lifecycle sweeps.
- `postgres` - metadata system of record.
- `redis` - queue backend for BullMQ jobs.
- `minio` - encrypted object storage.
- `vault` - transit engine for DEK wrap/unwrap.
- `clamav` - malware scanning daemon.
- `mailhog` - SMTP sink for local development/testing.
- `backup` - periodic backup sidecar for operational continuity.

Post-v1 Stage 9 baseline additions:

- `web` - user-facing UI shell routed by Caddy.
- `admin` - admin UI shell routed under `/admin`.
- `realtime` - realtime SSE shell routed under `/realtime`.

Post-v1 Stage 10 profile additions:

- `keycloak` - optional SSO identity provider.
- `opa` - optional policy decision engine.

Post-v1 Stage 11 profile additions:

- `opensearch` - optional search index backend.
- `opensearch_dashboards` - optional local search analytics UI.

Post-v1 Stage 12 profile additions:

- `preview` - optional document preview conversion shell.
- `ocr` - optional text extraction shell.

Post-v1 Stage 13 profile additions:

- `dlp` - optional DLP policy/evaluation shell.

Post-v1 Stage 14 profile additions:

- `prometheus` - metrics collection and scrape orchestration.
- `grafana` - local dashboard and query UI.
- `loki` - centralized log store.
- `promtail` - container log shipper for API/worker/realtime.

Post-v1 Stage 15 additions:

- `webhook-sink` - capture/list/clear endpoint shell for webhook integration tests.

Post-v1 Stage 16 additions:

- API auth MFA baseline paths (`TOTP` + `WebAuthn`) for second-factor login gates.

Post-v1 Stage 17 additions:

- `realtime` upgraded with JWT-authenticated WebSocket transport at `/realtime/ws`.

## Dependency Map

Inbound:

- Client -> `caddy` (`http://localhost:8080`, `https://localhost:8443`)
- `caddy` -> `api` (internal service routing for `/v1/*`)
- `caddy` -> `admin` (internal service routing for `/admin*`)
- `caddy` -> `realtime` (internal service routing for `/realtime*`)
- `caddy` -> `webhook-sink` (internal service routing for `/webhook-sink*`)
- `caddy` -> `web` (default route `/`)

API runtime dependencies:

- `api` -> `postgres` (Prisma metadata persistence)
- `api` -> `redis` (scan queue producer)
- `api` -> `minio` (encrypted object read/write)
- `api` -> `vault` (transit wrap/unwrap)
- `api` -> `keycloak` (optional SSO token/user profile exchange)
- `api` -> `opa` (optional policy decision checks for sensitive actions)
- `api` -> `redis` (search-index queue producer when enabled)
- `api` -> `redis` (content-process queue producer when enabled)
- `api` -> `opensearch` (query path for `/v1/search/files`)
- `api` -> `dlp` (reserved service path for DLP integration)
- `prometheus` -> `api` (scrapes `/v1/metrics`)
- `prometheus` -> `worker` (scrapes `/v1/metrics`)
- `prometheus` -> `realtime` (scrapes `/metrics`)
- `realtime` -> JWT access secret (validates access-token auth for SSE/WebSocket entrypoints)

Worker runtime dependencies:

- `worker` -> `redis` (queue consumer/scheduler)
- `worker` -> `postgres` (file lifecycle transitions)
- `worker` -> `minio` (encrypted object retrieval)
- `worker` -> `vault` (DEK unwrap for scan)
- `worker` -> `clamav` (scan verdicts)
- `worker` -> `preview` (reserved service path for conversion integration)
- `worker` -> `ocr` (reserved service path for extraction integration)
- `worker` -> `opensearch` (search index upsert/delete sync)
- `promtail` -> `api`/`worker`/`realtime` container logs (ships to Loki)
- `grafana` -> `prometheus` + `loki` (reads metrics/logs)

Operational workflows:

- `backup`/`infra/scripts/backup.sh` -> `postgres` + `minio`
- `infra/scripts/restore-live.sh` -> `postgres` + `minio`

## Data Domains

- PostgreSQL:
  - identity/session/org metadata
  - MFA factor metadata (TOTP + WebAuthn credential baselines)
  - file metadata/lifecycle
  - share metadata/policies
  - audit events
- MinIO:
  - encrypted file payload objects
- Vault:
  - transit key material and cryptographic wrap/unwrap operations
- Redis:
  - async job queues and scheduled maintenance jobs
- Prometheus:
  - scraped service metrics and short-horizon time-series
- Loki:
  - centralized API/worker/realtime log streams

## Trust Boundaries

1. External client boundary (`caddy` edge).
2. Application boundary (`api` + `worker`) to stateful services.
3. Cryptographic boundary (Vault transit operations and key custody assumptions).
4. Operational boundary (backup/restore scripts and local filesystem artifacts).

## Security-Critical Invariants

- Non-`active` files are denied for download and share access.
- MFA-enrolled users are denied login without a valid second factor.
- Malware scan gate must transition files fail-closed on terminal scan errors.
- DLP-sensitive upload/share actions deny by default when policy matches and override is not enabled.
- Metrics endpoints remain read-only and expose process/service telemetry only.
- Raw DEKs are not persisted in Postgres.
- Critical actions emit audit events.
- Destructive restore/reset operations require explicit confirmation env vars.

## Handoff Notes

- This map reflects the local prototype topology only.
- Out-of-scope enterprise services remain intentionally excluded for v1 and are added only as post-v1 profile-gated baselines.
