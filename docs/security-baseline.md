# Security Baseline (v1 Prototype)

## Status Note

This document defines target baseline controls for v1. As of 2026-03-17, auth,
MFA, encrypted file ingest, malware-gated activation, share policy, audit
query/export/analytics, backup/restore, secret rotation, and CI security gates
are implemented.

## Authentication and Identity

- Target:
  - Local auth only in v1.
  - Password hashing: Argon2id.
  - JWT access tokens with short TTL.
  - Rotating refresh tokens with revocation and replay detection.
  - RBAC baseline roles: `admin`, `member`.
  - MFA with TOTP + WebAuthn support.
- Implemented now:
  - Argon2id hash generation utility (`apps/api/src/tools/hash-password.ts`).
  - bootstrap admin seed requires Argon2id-format hash (`infra/scripts/bootstrap.sh`, `infra/scripts/seed-admin.sh`).
  - auth runtime endpoints (`login`, `refresh`, `logout`) with JWT access token issuance.
  - auth MFA runtime endpoints (`/auth/mfa/status`, TOTP enroll/verify/disable, WebAuthn register options/verify).
  - login enforcement requiring second factor when MFA factors are enrolled.
  - realtime service validates JWT access tokens for authenticated stream and WebSocket entrypoints.
  - refresh-token persistence, rotation, and revocation baseline in `refresh_tokens`.
  - RBAC baseline enforcement (`admin`, `member`) on protected route checks.
- Not implemented yet:
  - production-grade WebAuthn attestation/assertion cryptographic verification depth.
  - optional external identity integration hardening beyond baseline SSO exchange flow.

## Authorization

- Target:
  - Centralized policy checks for file and share operations.
  - Organization boundaries enforced in service layer.
  - Download allowed only for `active` files and authorized principals.
- Implemented now:
  - auth route-level role checks via `JwtAuthGuard` + `RolesGuard`.
  - `packages/shared/src/file-lifecycle.ts` models allowed status transitions and download eligibility helper.
  - API-level org membership enforcement for file and share management flows.
- Not implemented yet:
  - Fine-grained policy model beyond owner/admin + org membership checks.

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
  - Content derivation retry audit events and fail-closed blocking on terminal pipeline errors.
  - DLP hardening with expanded PII/secret corpus and governed override controls.
  - share/create DLP checks include derived artifact text corpus when available.
  - Worker maintenance jobs for expiration and cleanup transitions.
  - share link enforcement with expiry/password/max-download checks and revocation.
- Not implemented yet:
  - Advanced DLP/abuse heuristics for share-link access patterns.

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
- runtime share event emission for create/access/revoke outcomes.
- admin-gated audit query, NDJSON export, summary, timeseries, and KPI baseline.

Not implemented yet:

- Aggregated analytics/reporting and long-retention operational tuning.

## Operational Security

- Secrets are injected via environment placeholders; real secrets are not committed.
- `.env.example` provides placeholders only.
- Bootstrap scripts are idempotent where practical and enforce admin hash guardrails.
- Backup artifacts include checksum manifest; restore smoke verifies backup shape plus PostgreSQL and MinIO restore integrity.
- Live restore and reset scripts require explicit destructive confirmations.
- API and worker run as non-root with read-only filesystems and dropped Linux capabilities.
- CI includes secret-hygiene scanning and high-severity dependency audit baseline.

## Safe Failure Behavior

Target behavior:

- Vault unavailable -> encryption-dependent operations fail closed.
- ClamAV unavailable -> activation blocked; files remain non-active.
- Redis queue unavailable -> upload may persist but remains non-downloadable until scan workflow recovers.

Current limitation:

- Prototype policies are intentionally narrow; enterprise-grade policy depth and reporting are deferred.

## Deferred Hardening (Documented)

- MFA anti-phishing controls and recovery-factor hardening.
- Fine-grained ABAC/policy engine depth and externalized policy operations.
- Production-grade key custody, secret distribution, and post-rotation observability.
