# Schwass Secure File Lab (Governed Prototype)

Self-hosted secure file sharing prototype focused on deterministic local deployment, explicit security controls, and governance-first delivery.

## Current Implementation Status (2026-03-03)

This repository currently implements a **Phase 0/1 scaffold**, not a complete secure file sharing prototype.

Implemented now:

- Monorepo tooling, CI skeleton, governance docs, and ADR scaffolding.
- Docker Compose topology for required v1 services.
- Deterministic bootstrap scripts for:
  - PostgreSQL migration SQL apply
  - MinIO bucket initialization
  - Vault transit mount/key setup (dev mode)
  - idempotent local admin seed
- API and worker health endpoints.
- Basic Prisma schema (`users`, `bootstrap_state`, `audit_events`).
- Shared file lifecycle helper (library only; not wired to API persistence/authorization paths).
- Backup artifact generation and restore smoke for database-level verification.

Not implemented yet:

- Auth endpoints and session lifecycle (login/logout/JWT/refresh rotation/RBAC enforcement).
- File ingest/download endpoints and MinIO object persistence flows.
- Envelope encryption with per-file DEKs + Vault wrap/unwrap flow in file pipeline.
- Malware scan queue/processors enforcing quarantine-to-active gate.
- Share-link model and endpoints.
- Runtime audit event capture for auth/file/share actions.

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
  - API: `health`, `system` (scaffold)
  - Worker: `health`, `jobs` placeholder
- Planned modules (not yet implemented): `auth`, `users_orgs`, `files`, `shares`, `audit`.
- PostgreSQL/Redis/MinIO/Vault/ClamAV are wired for infrastructure readiness, but domain workflows are pending.

## Security Baseline

- Implemented controls:
  - non-hardcoded environment placeholders in `.env.example`
  - bootstrap guardrails for Argon2id admin hash format
  - non-root/read-only runtime for API and worker with dropped capabilities
  - Caddy basic security headers
  - scaffold file lifecycle transition helper in `packages/shared`
- Planned controls (not yet implemented in runtime flows):
  - JWT auth and rotating refresh tokens
  - RBAC authorization enforcement
  - malware scan gate in worker
  - envelope encryption in file path
  - share-link policy enforcement
  - end-to-end audit trail for critical user actions

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
- `make up` - start compose stack
- `make down` - stop stack
- `make bootstrap` - run deterministic first-run init
- `make backup` - run local backup procedure
- `make restore-smoke` - run smoke restore path
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
- `docs/runbooks/bootstrap.md`
- `docs/runbooks/backup-and-restore.md`
- `docs/runbooks/local-development.md`

## Commercial Add-On Artifacts

- `docs/addons/ADDON-001-HARDENING-REPRODUCIBILITY-CHANGELOG.md`

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
- `docs/legal/FORK_LICENSE_TEMPLATE.md`
- `docs/legal/SESSION_PREP_PACKAGE.md`
- `docs/legal/CLIENT_MEETING_CHECKLIST.md`
- `docs/legal/SESSION_RUN_SCRIPT.md`
- `docs/legal/PRE_SESSION_EMAIL_TEMPLATE.md`

Commercialization or enterprise-core use of this IP requires a separate signed commercial rights agreement.

## Current Status

- Completed: Phase 0 and Phase 1.
- In progress: hardening validation pass for scaffold.
- Not started: feature phases (auth, files, shares, audit, worker scan pipeline).

Detailed evidence is tracked in `docs/status`.
