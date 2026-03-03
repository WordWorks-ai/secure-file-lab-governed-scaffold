# Security Findings

Assessment date: 2026-03-03

## Critical

### SF-001: Core authentication/session controls not implemented

- Severity: Critical
- Status: Deferred
- Evidence:
  - No auth module/controllers in API module tree (`apps/api/src/modules` only `health` and `system`).
  - No JWT/refresh flow implementation in `apps/api/src`.
- Risk:
  - No enforceable auth/session security baseline for intended prototype.
- Remediation path:
  - Implement Phase 3 auth module with Argon2id verify, JWT access, rotating refresh tokens, revocation, RBAC checks, and auth audit emission.

### SF-002: File security pipeline not implemented

- Severity: Critical
- Status: Deferred
- Evidence:
  - No file upload/download/storage modules in API.
  - Worker jobs are placeholders (`apps/worker/src/modules/jobs/jobs.service.ts`).
  - No BullMQ processors or ClamAV gate logic in worker code.
- Risk:
  - Intended quarantine->scan->active gate is not enforceable.
- Remediation path:
  - Implement file ingest state machine, MinIO persistence, Vault wrap/unwrap, queue workers, and strict download authorization gate.

### SF-003: Share-link policy controls not implemented

- Severity: Critical
- Status: Deferred
- Evidence:
  - No share entity/service/controller implementation under `apps/api/src`.
- Risk:
  - No expiry/password/download-limit enforcement for sharing.
- Remediation path:
  - Implement share token model and policy checks with race-safe counters and audit coverage.

## High

### SF-004: Governance documentation drifted from code reality

- Severity: High
- Status: Fixed
- Evidence:
  - Security/governance docs described controls not present in runtime flows.
- Remediation made:
  - Updated `README.md`, `docs/security-baseline.md`, `docs/threat-model.md`, `docs/data-model.md`, `docs/runbooks/backup-and-restore.md` to explicitly distinguish implemented vs planned controls.

### SF-005: Backup retention deletion scope lacked strong path validation

- Severity: High
- Status: Fixed
- Evidence:
  - Retention cleanup in `infra/scripts/backup.sh` used recursive deletion of discovered dirs without root path guard.
- Remediation made:
  - Added hard guards:
    - reject `BACKUP_ROOT` resolving to `/`
    - enforce `OUT_DIR` is inside `BACKUP_ROOT`

### SF-006: Restore smoke timing reliability gap

- Severity: High
- Status: Fixed
- Evidence:
  - Intermittent `temporary postgres did not become ready` under load.
- Remediation made:
  - Added `SMOKE_DB_WAIT_SECONDS` configurable wait window and timeout diagnostics in `infra/scripts/restore-smoke.sh`.

### SF-007: Bootstrap admin seed guardrails were insufficiently strict

- Severity: High
- Status: Fixed
- Evidence:
  - Seed/bootstrap needed stronger validation and safer SQL variable handling.
- Remediation made:
  - Enforced Argon2id hash-format checks and placeholder rejection.
  - Added email-format validation.
  - Used `psql -v` parameter interpolation with `:'var'` in `infra/scripts/seed-admin.sh`.

## Medium

### SF-008: In-container Vitest execution incompatible with read-only runtime hardening

- Severity: Medium
- Status: Deferred
- Evidence:
  - Vite attempts to create `node_modules/.vite-temp` under read-only container filesystem.
- Risk:
  - Reduced ability to execute tests from running hardened containers.
- Remediation path:
  - Keep CI tests on writable runners.
  - Optionally add dedicated non-production test profile/services with writable paths.

### SF-009: Caddy healthcheck is shallow

- Severity: Medium
- Status: Deferred
- Evidence:
  - Healthcheck uses `caddy version` command, not request behavior.
- Risk:
  - Potential false healthy state if proxy routes break while process remains alive.
- Remediation path:
  - Replace with HTTP probe from sidecar or script-level endpoint assertion in CI smoke.

### SF-010: Scripts trust `.env` as executable shell input

- Severity: Medium
- Status: Deferred
- Evidence:
  - Scripts use `source .env`.
- Risk:
  - Untrusted `.env` could execute shell syntax.
- Remediation path:
  - Implement strict key-value parser for env ingestion.

## Low

### SF-011: BuildKit instability in this workspace context

- Severity: Low
- Status: Mitigated
- Evidence:
  - Intermittent BuildKit session-header errors during compose build.
- Remediation made:
  - Bootstrap and reproducibility paths run with `DOCKER_BUILDKIT=0`.

## Controls Added In This Pass

- Non-root + read-only + dropped capabilities + `no-new-privileges` for API/worker.
- Caddy security headers baseline.
- Backup checksum manifest and retention metadata.
- Restore smoke artifact validation + checksum verification + improved timeout diagnostics.
- Hardening shell tests and CI integration:
  - `infra/scripts/tests/hardening-baseline.sh`
  - `infra/scripts/tests/backup-restore-guards.sh`

## Open Security Work Required Before Prototype Security Handoff

1. Implement Phase 2-6 domain controls (auth/file/share/audit/worker pipeline).
2. Add end-to-end negative security tests across real workflows.
3. Add MinIO restore path and workflow-level post-restore assertions.
4. Replace or constrain `.env` sourcing behavior for scripts.
