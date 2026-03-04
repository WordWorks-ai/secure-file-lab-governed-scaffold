# Architecture and Service Map (v1 Prototype)

## Purpose

Provide an operator-facing map of services, trust boundaries, and runtime dependencies for the Phase 8 handoff baseline.

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

## Dependency Map

Inbound:

- Client -> `caddy` (`http://localhost:8080`, `https://localhost:8443`)
- `caddy` -> `api` (internal service routing for `/v1/*`)
- `caddy` -> `admin` (internal service routing for `/admin*`)
- `caddy` -> `realtime` (internal service routing for `/realtime*`)
- `caddy` -> `web` (default route `/`)

API runtime dependencies:

- `api` -> `postgres` (Prisma metadata persistence)
- `api` -> `redis` (scan queue producer)
- `api` -> `minio` (encrypted object read/write)
- `api` -> `vault` (transit wrap/unwrap)
- `api` -> `keycloak` (optional SSO token/user profile exchange)
- `api` -> `opa` (optional policy decision checks for sensitive actions)
- `api` -> `redis` (search-index queue producer when enabled)
- `api` -> `opensearch` (query path for `/v1/search/files`)

Worker runtime dependencies:

- `worker` -> `redis` (queue consumer/scheduler)
- `worker` -> `postgres` (file lifecycle transitions)
- `worker` -> `minio` (encrypted object retrieval)
- `worker` -> `vault` (DEK unwrap for scan)
- `worker` -> `clamav` (scan verdicts)
- `worker` -> `opensearch` (search index upsert/delete sync)

Operational workflows:

- `backup`/`infra/scripts/backup.sh` -> `postgres` + `minio`
- `infra/scripts/restore-live.sh` -> `postgres` + `minio`

## Data Domains

- PostgreSQL:
  - identity/session/org metadata
  - file metadata/lifecycle
  - share metadata/policies
  - audit events
- MinIO:
  - encrypted file payload objects
- Vault:
  - transit key material and cryptographic wrap/unwrap operations
- Redis:
  - async job queues and scheduled maintenance jobs

## Trust Boundaries

1. External client boundary (`caddy` edge).
2. Application boundary (`api` + `worker`) to stateful services.
3. Cryptographic boundary (Vault transit operations and key custody assumptions).
4. Operational boundary (backup/restore scripts and local filesystem artifacts).

## Security-Critical Invariants

- Non-`active` files are denied for download and share access.
- Malware scan gate must transition files fail-closed on terminal scan errors.
- Raw DEKs are not persisted in Postgres.
- Critical actions emit audit events.
- Destructive restore/reset operations require explicit confirmation env vars.

## Handoff Notes

- This map reflects the local prototype topology only.
- Out-of-scope enterprise services (Keycloak/OPA/OpenSearch/etc.) remain intentionally excluded for v1.
