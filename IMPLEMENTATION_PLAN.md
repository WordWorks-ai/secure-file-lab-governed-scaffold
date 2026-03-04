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

## Post-v1 Expansion Plan (Enterprise Add-ons)

These stages are executed sequentially to minimize integration risk and keep each checkpoint shippable.

### Stage 9 - Frontend and Realtime Foundation

#### Deliverables

- `web` service baseline with authenticated user workflow shell.
- `admin` service baseline with operational/audit dashboard shell.
- `realtime` service baseline and Caddy route exposure.
- Shared API contracts for notifications and UI health/status checks.

#### Validation

- Compose includes `web`, `admin`, and `realtime` services.
- End-to-end smoke verifies:
  - web route reachable via Caddy
  - admin route reachable via Caddy
  - realtime health endpoint reachable via Caddy
- New tests for route/health wiring pass.

#### Exit Criteria

- 3/3 new services start healthy in local compose.
- No regressions to existing v1 test suites.

### Stage 10 - Identity and Policy Engine

#### Deliverables

- Keycloak service integration for optional SSO.
- OPA service integration for policy-as-code checks.
- API policy adapter with fallback mode and explicit deny behavior.

#### Validation

- SSO login flow test path (enabled profile) succeeds.
- OPA policy decision tests cover allow/deny/malformed-policy paths.
- Fail-safe behavior test denies protected actions on policy-engine failure.

#### Exit Criteria

- Externalized policy checks gate sensitive share/file operations.
- SSO mode can be enabled without breaking local-password auth mode.

### Stage 11 - Search Layer

#### Deliverables

- OpenSearch service integration and index bootstrap.
- Worker-driven indexing pipeline for files/shares/audit metadata.
- Search API endpoints with scoped query filters.

#### Validation

- Index bootstrap idempotency tests pass.
- Search indexing integration tests cover create/update/delete reindex paths.
- Search query tests enforce tenant/org scoping and result limits.

#### Exit Criteria

- New/updated metadata is searchable within bounded latency after worker processing.
- Search remains local-only and self-hosted.

### Stage 12 - Preview and OCR Pipeline

#### Deliverables

- `preview` service path for document/PDF thumbnail conversion.
- `ocr` service path for text extraction and indexing payload generation.
- Worker orchestration for preview/OCR job lifecycle and retry policy.

#### Validation

- Supported-file conversion tests pass for at least PDF and Office samples.
- OCR extraction tests pass for text-bearing scanned samples.
- Pipeline failure tests verify fail-closed behavior for malformed content.

#### Exit Criteria

- Preview/OCR outputs are stored and linked to file metadata.
- Pipeline jobs are observable via audit events.

### Stage 13 - DLP Pipeline

#### Deliverables

- DLP scanner service/profile integration.
- Policy set for PII/secrets baseline detection.
- API/share enforcement hooks for DLP decisions.

#### Validation

- Detection test corpus verifies true-positive and false-positive baselines.
- Enforcement tests verify block/quarantine/audit behavior by policy.
- Override flow tests verify admin-governed exception handling.

#### Exit Criteria

- DLP verdicts are enforced consistently on upload/share workflows.
- Audit trails include policy id, verdict, and enforcement action.

### Stage 14 - Observability and Final Handoff

#### Deliverables

- Prometheus + Grafana + Loki compose profile integration.
- API/worker/realtime metrics/log wiring.
- Final runbooks and architecture updates for expanded topology.

#### Validation

- Metrics endpoint smoke tests pass for core services.
- Central log capture checks pass for API/worker/realtime.
- CI includes new profile-aware integration checks.

#### Exit Criteria

- Expanded stack can be run with or without observability profile.
- Handoff docs reflect actual runtime behavior and operational controls.

### Stage 15 - Webhook Sink Integration Harness

#### Deliverables

- `webhook-sink` compose service for local integration-test callbacks.
- Caddy route exposure for local operator/testing access.
- Capture/list/clear webhook endpoints for deterministic test assertions.

#### Validation

- Compose includes `webhook-sink` service with health checks.
- Caddy route smoke test reaches webhook sink endpoints.
- Scaffold tests verify capture and retrieval behavior.

#### Exit Criteria

- Webhook sink is reachable locally and can persist captured events.
- CI scaffold includes webhook-sink checks without regressions.

### Stage 16 - Multi-Factor Authentication Baseline

#### Deliverables

- TOTP enrollment, verification, disable, and login enforcement paths.
- WebAuthn registration challenge/verify baseline and login challenge/assertion gate.
- MFA status endpoint and auth audit-event coverage for MFA flows.

#### Validation

- Prisma schema/migration includes MFA persistence tables.
- Auth integration tests cover TOTP enrollment and MFA-gated login.
- Auth integration tests cover WebAuthn registration and challenge-based login path.

#### Exit Criteria

- Users with enrolled MFA factors cannot complete login without a valid second factor.
- MFA management routes and tests are wired into CI scaffold checks.

### Stage 17 - Realtime WebSocket Transport Baseline

#### Deliverables

- Realtime service supports authenticated WebSocket upgrades at `/ws`.
- Broadcast delivery fan-out reaches both SSE and WebSocket subscribers.
- Realtime auth model validates JWT access tokens for stream/upgrade paths.

#### Validation

- Realtime integration tests verify unauthorized upgrade rejection.
- Realtime integration tests verify authenticated upgrade + publish delivery.
- Stage 17 scaffold checks run realtime websocket auth/delivery smoke tests in CI.

#### Exit Criteria

- WebSocket notification path is functional and auth-gated.
- Existing SSE route remains available without regression.

### Stage 18 - Preview/OCR Hardening Baseline

#### Deliverables

- Worker content-derivation pipeline adds stronger extraction guardrails and bounded payload handling.
- Content processing retries emit explicit retry audit events.
- Terminal content-processing failure path supports fail-closed blocking for active files.

#### Validation

- Worker unit tests cover non-terminal retry behavior and terminal fail-closed behavior.
- Worker derivative-service unit tests cover normalization, fallback extraction, and payload bounds.
- Stage 18 scaffold checks validate env/config markers and test coverage wiring in CI.

#### Exit Criteria

- Content pipeline failures are observable and explicitly fail-safe when configured.
- Preview/OCR extraction behavior is bounded and deterministic for mixed payload types.

## Priority Order for Remaining Spec Gaps

1. Stage 19 - DLP hardening (expanded policy corpus, enforcement depth, and override governance).

## Expansion Definition of Done

Post-v1 expansion is complete when:

- All originally requested enterprise add-ons are implemented and routable in local compose.
- Security and policy checks are test-covered with fail-safe behavior.
- Regression suite for existing v1 features remains green.
- Runbooks and service map are updated for the expanded architecture.
