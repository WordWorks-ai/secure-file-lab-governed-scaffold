# Implementation Plan

This plan defines the development lifecycle and quality gates for the governed prototype. Phases are sequential unless explicit dependency constraints require overlap.

## Scope and Constraints

### In Scope (v1)

- Modular monolith API and separate async worker.
- Deterministic Docker Compose local deployment.
- Security baseline: auth, encryption, malware gate, RBAC, audit.
- Share links with expiry/password/usage controls.
- Backup and restore smoke path.
- Governance docs maintained with each phase.

### Out of Scope (v1)

- Keycloak, OPA, OpenSearch, OCR/preview conversion.
- Realtime service and separate admin service.
- Full observability stack and webhook sink.
- Full DLP engine.

## Repo-Level Quality Gates

No phase is complete until:

1. Code and docs for the phase are committed together.
2. Relevant tests are implemented and executed.
3. `docs/status/phase-XX.md` is updated with:
   - files added/changed
   - commands run
   - tests and results
   - assumptions
   - deferred items and rationale
4. Security-sensitive behavior is explicit in code and docs.

## Phase Plan

## Phase 0 - Foundation Decisions and Repo Bootstrap

### Deliverables

- Monorepo skeleton and workspace configuration.
- Tooling commands for lint, format, typecheck, and test.
- Governance docs and architecture ADR.
- Initial CI skeleton.
- Makefile and scripts directory.

### Validation

- Lint command runs.
- Typecheck command runs.
- Unit test harness runs.
- CI config validates basic pipeline structure.

### Exit Criteria

- Clean clone can install dependencies and execute validation commands.
- Repo structure and architecture intent are documented.

## Phase 1 - Local Infrastructure and Deterministic Bootstrap

### Deliverables

- Compose topology for required services.
- Caddy edge configuration.
- Named volumes, health checks, and env template.
- Bootstrap scripts for migrations, bucket init, Vault transit setup, and admin seed.
- One-command local startup path (`make up` + `make bootstrap`).

### Validation

- Compose configuration validates.
- Service readiness checks defined.
- Bootstrap scripts are idempotent where possible.
- Deterministic initialization documented in runbook.

### Exit Criteria

- Local stack starts reproducibly.
- First-run sequence is scriptable and documented.
- No secrets hardcoded in repository.

## Phase 2 - Data Model and Modular Monolith Shell

### Deliverables

- NestJS API skeleton with domain modules.
- Prisma schema and migrations for core entities.
- Health and readiness endpoints.
- Structured logging and request validation baseline.

### Validation

- App boots.
- Migrations apply.
- Domain persistence tests pass.

## Phase 3 - Authentication and Authorization

### Deliverables

- Local auth with Argon2id.
- JWT access and rotating refresh token flow.
- RBAC baseline and rate limiting.
- Auth audit events.

### Validation

- Auth flow tests and token lifecycle tests.
- Authorization enforcement tests.

## Phase 4 - File Ingest, Storage, and Encryption

### Deliverables

- File metadata and lifecycle transitions.
- API-managed upload path.
- MinIO encrypted object persistence.
- Per-file DEK generation and Vault transit wrapping.
- Download gate tied to lifecycle state.

### Validation

- Encryption and state transition tests.
- Upload validation tests for type/size/limits.

## Phase 5 - Worker, Queue, Malware Scan Gate

### Deliverables

- BullMQ queues and worker processors.
- Malware scan job with safe failure behavior.
- Expiration and cleanup jobs.
- Audit events for async transitions.

### Validation

- Clean vs infected transition tests.
- Idempotency and retry tests.

## Phase 6 - Share Links, Access Control, and Audit Completeness

### Deliverables

- Share model with token, expiry, password, and usage limits.
- Org boundary enforcement for share operations.
- Centralized authorization checks.
- Audit query/export baseline.

### Validation

- Share lifecycle tests and policy enforcement tests.

## Phase 7 - Backup, Restore, and Operational Readiness

### Deliverables

- Postgres and MinIO backup workflows.
- Restore smoke path.
- Vault recovery guidance for prototype.
- Operational runbooks for reset/bootstrap/restore.

### Validation

- Backup artifact generation and restore smoke test.

## Phase 8 - CI, Quality Gates, and Handoff Polish

### Deliverables

- CI for lint/typecheck/unit/integration.
- Container build validation.
- Dependency audit and secret scanning baseline.
- Final docs and architecture/service map.

### Validation

- CI green on clean branch.
- Onboarding path works from clean clone.

## Sequencing and Dependency Notes

- Phase 2 depends on Phase 1 bootstrap contracts (DB, Redis, MinIO, Vault).
- File workflow phases (4-6) must preserve lifecycle model defined in ADR-002.
- Security controls are implemented before usability enhancements.
- Backup/restore (Phase 7) must cover data introduced by earlier phases.

## Definition of Done (Prototype Handoff)

Prototype is handoff-ready when:

- All required v1 services run locally through compose.
- Auth, file upload, malware gate, share controls, and audit path are tested.
- Backup and restore have a documented and smoke-tested path.
- Governance docs and implementation status reflect actual code behavior.
