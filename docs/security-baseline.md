# Security Baseline (v1 Prototype)

## Status Note

This document defines target baseline controls for v1. As of 2026-03-04, core auth + file malware-gate controls are implemented, while share and full audit-query controls remain incomplete.

## Authentication and Identity

- Target:
  - Local auth only in v1.
  - Password hashing: Argon2id.
  - JWT access tokens with short TTL.
  - Rotating refresh tokens with revocation and replay detection.
  - RBAC baseline roles: `admin`, `member`.
  - MFA: deferred implementation with explicit roadmap entry.
- Implemented now:
  - Argon2id hash generation utility (`apps/api/src/tools/hash-password.ts`).
  - bootstrap admin seed requires Argon2id-format hash (`infra/scripts/bootstrap.sh`, `infra/scripts/seed-admin.sh`).
  - auth runtime endpoints (`login`, `refresh`, `logout`) with JWT access token issuance.
  - refresh-token persistence, rotation, and revocation baseline in `refresh_tokens`.
  - RBAC baseline enforcement (`admin`, `member`) on protected route checks.
- Not implemented yet:
  - MFA and optional external identity integration (deferred by scope).

## Authorization

- Target:
  - Centralized policy checks for file and share operations.
  - Organization boundaries enforced in service layer.
  - Download allowed only for `active` files and authorized principals.
- Implemented now:
  - auth route-level role checks via `JwtAuthGuard` + `RolesGuard`.
  - `packages/shared/src/file-lifecycle.ts` models allowed status transitions and download eligibility helper.
- Not implemented yet:
  - API-level authorization enforcement for files/shares/org boundaries.

## File and Malware Controls

- Target:
  - Encrypted object persistence in MinIO.
  - Per-file DEK generated in app path.
  - Vault transit used to wrap/unwrap DEKs.
  - File lifecycle state machine enforced.
  - Malware scan gate required before activation.
  - Infected files transition to `blocked` and remain non-downloadable.
- Implemented now:
  - Infrastructure wiring for MinIO, Vault, and ClamAV in compose/bootstrap.
  - API-managed upload path with content type / size validation.
  - Per-file DEK generation, AES-256-GCM encryption, and Vault transit wrap/unwrap.
  - Encrypted object persistence in MinIO on upload path.
  - Lifecycle progression to `scan_pending` with non-`active` download denial.
  - BullMQ queue producer and worker scanner for `scan_pending -> active|blocked`.
  - Retry behavior that fails closed to `blocked` on terminal scan errors.
  - Worker maintenance jobs for expiration and cleanup transitions.
- Not implemented yet:
  - Share-aware malware policy coupling and share-level controls.

## Audit and Traceability

Target critical actions that must produce audit events:

- auth login/logout/refresh failures and successes
- file upload and lifecycle transitions
- scan outcomes
- share create/use/revoke
- protected download attempts and outcomes

Implemented now:

- `audit_events` table exists in schema/migrations.
- runtime auth event emission for login/refresh/logout outcomes.
- runtime file event emission for upload initiation, encryption persistence, scan queueing, and download outcomes.
- async worker event emission for scan, expiration, and cleanup outcomes.

Not implemented yet:

- Runtime event emission for share lifecycle and audit query/export APIs.

## Operational Security

- Secrets are injected via environment placeholders; real secrets are not committed.
- `.env.example` provides placeholders only.
- Bootstrap scripts are idempotent where practical and enforce admin hash guardrails.
- Backup artifacts include checksum manifest; restore smoke verifies backup shape plus PostgreSQL and MinIO restore integrity.
- API and worker run as non-root with read-only filesystems and dropped Linux capabilities.

## Safe Failure Behavior

Target behavior:

- Vault unavailable -> encryption-dependent operations fail closed.
- ClamAV unavailable -> activation blocked; files remain non-active.
- Redis queue unavailable -> upload may persist but remains non-downloadable until scan workflow recovers.

Current limitation:

- These invariants are only partially complete because share workflows and centralized share policy enforcement are not yet implemented.

## Deferred Hardening (Documented)

- MFA implementation details.
- Fine-grained ABAC/policy engine.
- Tamper-evident audit chain.
- Full secret rotation automation.
