# Schwass Secure File Lab (Governed Prototype)

Self-hosted secure file sharing prototype focused on deterministic local deployment, explicit security controls, and governance-first delivery.

## Current Implementation Status (2026-03-04)

This repository currently implements a **Phase 0/8 governed prototype baseline** with runtime flows, operational backup/restore readiness, and CI/handoff quality gates.

Implemented now:

- Monorepo tooling, CI quality-gate workflow, governance docs, and ADR scaffolding.
- Docker Compose topology for required v1 services.
- Deterministic bootstrap scripts for:
  - PostgreSQL migration SQL apply
  - MinIO bucket initialization
  - Vault transit mount/key setup (dev mode)
  - idempotent local admin seed
- API and worker health endpoints (`/health/live`) and API readiness endpoint (`/health/ready`).
- Modular API domain shell modules: `auth`, `users-orgs`, `files`, `shares`, `audit`.
- Auth runtime baseline:
  - `POST /v1/auth/login`
  - `POST /v1/auth/refresh`
  - `POST /v1/auth/logout`
  - `GET /v1/auth/me`
  - `GET /v1/auth/admin-check` (RBAC baseline)
- File ingest/encryption baseline:
  - `POST /v1/files/upload` (validated payload, size/type limits)
  - encrypted object persistence to MinIO
  - per-file DEK generation and Vault transit wrap/unwrap
  - lifecycle progression to `scan_pending`
  - download gate enforcement (non-`active` denied)
- Worker malware gate baseline:
  - BullMQ queue producer for file scan jobs
  - worker scan processor decrypts, scans via ClamAV, and transitions `scan_pending -> active|blocked`
  - retry policy with terminal fail-closed blocking
  - recurring expiration and cleanup sweeps
  - async audit emission for scan, expiration, and cleanup transitions
- Share and access-policy baseline:
  - `POST /v1/shares` (share creation with token, expiry, optional password, optional usage limit)
  - `POST /v1/shares/:shareId/revoke` (share revocation)
  - `POST /v1/shares/access` (public share-link access with policy enforcement)
  - org boundary and membership enforcement for share management
- Audit query/export/summary baseline:
  - `GET /v1/audit/events` (filtered audit query, admin-gated)
  - `GET /v1/audit/events/export` (NDJSON export, admin-gated)
  - `GET /v1/audit/events/summary` (aggregated counts by action/result/resource/actor, admin-gated)
- Core Prisma schema + migration baseline for `users`, `orgs`, `memberships`, `files`, `shares`, `refresh_tokens`, `bootstrap_state`, and `audit_events`.
- Structured request logging interceptor and stricter global request validation baseline.
- Runtime auth + file audit event emission.
- Backup artifact generation and restore smoke for PostgreSQL + MinIO verification.
- Destructive live restore workflow for running compose `postgres` + `minio` with guardrails.
- Destructive reset workflow for clean-volume rebuild scenarios.
- CI split gates for lint, typecheck, unit tests, and integration tests.
- Dependency audit baseline (`pnpm audit` high-severity gate) and secret-hygiene scan baseline.
- Container build validation for `api` and `worker` images.
- Architecture and service-map handoff documentation.

Not implemented in v1 (intentionally out of scope):

- Enterprise identity/policy/search add-ons (Keycloak/OPA/OpenSearch/OCR/realtime/admin split/observability stack).

## Purpose

This repository implements a constrained v1 architecture to prove core controls without building an enterprise-scale platform prematurely.

In-scope v1 services:

- `caddy`
- `api` (NestJS modular monolith)
- `worker` (NestJS async jobs)
- `postgres`
- `redis`
- `minio`
- `vault`
- `clamav`
- `mailhog`
- `backup`

Out-of-scope for v1 unless explicitly added later as placeholders: Keycloak, OPA, OpenSearch, OCR/preview conversion, realtime service, separate admin service, observability dashboards, webhook sink, full DLP.

## Architecture Summary

- Target architecture: NestJS modular monolith API + dedicated worker.
- Implemented modules:
  - API: `health`, `system`, `auth`, `users-orgs`, `files`, `shares`, `audit` (Phase 8 handoff baseline)
  - Worker: `health`, `jobs` (file scan processor + expiration/cleanup jobs)
- PostgreSQL/Redis/MinIO/Vault/ClamAV are wired for runtime workflows and operational backup/restore paths.

## Security Baseline

- Implemented controls:
  - non-hardcoded environment placeholders in `.env.example`
  - bootstrap guardrails for Argon2id admin hash format
  - non-root/read-only runtime for API and worker with dropped capabilities
  - Caddy security headers and local HTTPS termination (`tls internal`)
  - JWT access token issuance and rotating refresh token flow
  - RBAC baseline enforcement on protected route (`admin` / `member`)
  - file upload encryption path with per-file DEK + Vault transit wrapping
  - MinIO encrypted object persistence for uploaded payloads
  - download gate blocks non-`active` file statuses
  - BullMQ-backed malware scan queue and worker processing
  - automatic clean/infected scan transitions with fail-closed blocking
  - expiration and cleanup maintenance jobs in worker runtime
  - share lifecycle and policy controls (token, expiry, password, usage limits)
  - audit query, NDJSON export, and summary baseline (admin-gated)
  - auth + file + share audit emission for implemented runtime actions
  - backup checksums + restore smoke validation
  - live restore safety guards and post-restore health verification
- Planned controls (not yet implemented in runtime flows):
  - deeper audit analytics/reporting workflows and long-retention operationalization
  - production-grade secret rotation, key custody, and externalized policy engines

## Repository Layout

- `apps/api` - NestJS API (modular monolith)
- `apps/worker` - NestJS worker for async jobs
- `packages/shared` - shared domain helpers/types
- `infra/caddy` - Caddy edge config
- `infra/compose` - Docker Compose topology
- `infra/scripts` - deterministic bootstrap and ops scripts
- `docs/adr` - architecture decision records
- `docs/runbooks` - operational runbooks
- `docs/status` - per-phase implementation status artifacts

## Quick Start

For a step-by-step operator walkthrough, see `docs/runbooks/getting-started.md`.

1. Copy environment template:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
pnpm install
```

If outbound npm access is unavailable in your environment, you can still bootstrap via Docker.

3. Validate local setup:

```bash
make validate
```

4. Start local platform:

```bash
make up
```

5. Run first-run bootstrap:

```bash
make bootstrap
```

Before bootstrap, set a real Argon2id hash for `BOOTSTRAP_ADMIN_PASSWORD_HASH` in `.env` or export it for the command invocation.

## Core Commands

- `make validate` - lint, typecheck, tests, compose validation
- `make test-unit` - run explicit unit test suites
- `make test-integration` - run explicit integration/e2e suites
- `make test-dependency-audit` - run high-severity dependency audit baseline
- `make test-container-build` - validate container builds for api/worker
- `make up` - start compose stack
- `make down` - stop stack
- `make bootstrap` - run deterministic first-run init
- `make backup` - run local backup procedure
- `make restore-smoke` - run smoke restore path
- `RESTORE_CONFIRM=YES make restore-live` - restore selected/latest backup into live postgres/minio (destructive)
- `RESET_CONFIRM=YES make reset` - down volumes and optionally re-bootstrap from clean state (destructive)
- `./infra/scripts/demo-session.sh` - run end-to-end technical demo validation script

## Governance Documents

See:

- `IMPLEMENTATION_PLAN.md`
- `docs/adr/ADR-001-architecture-and-stack.md`
- `docs/adr/ADR-002-file-lifecycle.md`
- `docs/adr/ADR-003-encryption-and-key-management.md`
- `docs/threat-model.md`
- `docs/security-baseline.md`
- `docs/data-model.md`
- `docs/architecture-service-map.md`
- `docs/runbooks/bootstrap.md`
- `docs/runbooks/backup-and-restore.md`
- `docs/runbooks/reset-bootstrap-restore.md`
- `docs/runbooks/vault-recovery.md`
- `docs/runbooks/local-development.md`
- `docs/runbooks/getting-started.md`
- `CONTRIBUTING.md`

## Commercial Add-On Artifacts

- `docs/addons/ADDON-001-HARDENING-REPRODUCIBILITY-CHANGELOG.md`

## Valuation Artifacts

- `docs/valuation/INDEPENDENT_VALUATION_REPORT.md`
- `docs/valuation/CONVERSATION_REVIEW_AND_FORWARD_POSITION.md`
- `docs/valuation/AUTHORSHIP_MODEL_COMMERCIAL_POSITION.md`
- `docs/valuation/verify-valuation-claims.sh`
- `docs/valuation/verify-history-and-authorship-signals.sh`

## Client-Provided Source Materials

- `docs/client-source/CLIENT-PROVIDED-SOURCE.md`
- `docs/client-source/README.md`

Client-provided materials in this directory remain 100% owned by the client.

## Legal And Demo Package

Default licensing posture is proprietary (All Rights Reserved). See:

- `LICENSE`
- `docs/legal/LEGAL_DECISIONS.md`
- `docs/legal/DEMO_EVALUATION_TERMS.md`
- `docs/legal/RECORDING_AND_REFERENCE_CONSENT.md`
- `docs/legal/COMMERCIAL_RIGHTS_OPTIONS.md`
- `docs/legal/PRICING_AND_EFFORT_ESTIMATE.md`
- `docs/legal/COMMERCIAL_POSITION_BASELINE.md`
- `docs/legal/CLIENT_PRICING_TALK_TRACK.md`
- `docs/legal/FORK_LICENSE_TEMPLATE.md`
- `docs/legal/SESSION_PREP_PACKAGE.md`
- `docs/legal/CLIENT_MEETING_CHECKLIST.md`
- `docs/legal/SESSION_RUN_SCRIPT.md`
- `docs/legal/PRE_SESSION_EMAIL_TEMPLATE.md`
- `docs/legal/INITIAL_ENGAGEMENT_EMAIL_DRAFT.md`

Commercialization or enterprise-core use of this IP requires a separate signed commercial rights agreement.

## Current Status

- Completed: Phase 0, Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7, and Phase 8.
- Completed: hardening validation pass for scaffold.
- Remaining work is out-of-scope v1 expansion only.

Detailed evidence is tracked in `docs/status`.
