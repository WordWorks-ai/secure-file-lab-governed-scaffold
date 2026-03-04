# Threat Model (Draft)

## Implementation Status Note

This threat model captures target controls. Current codebase is Phase 0/7 with share-policy, audit-query/export, and operational backup/restore baseline implemented; CI/handoff polish remains in later phases.

## Scope

Prototype scope includes API, worker, and local infrastructure services (`postgres`, `redis`, `minio`, `vault`, `clamav`, `mailhog`, `caddy`, `backup`).

## Assets

- User credentials and refresh tokens
- File payloads and metadata
- Wrapped DEKs and encryption metadata
- Audit event history
- Share tokens/password digests
- Backup artifacts

## Trust Boundaries

1. External client <-> Caddy edge
2. Caddy <-> API
3. API <-> Postgres/Redis/MinIO/Vault
4. Worker <-> Redis/ClamAV/Postgres/MinIO/Vault
5. Backup process <-> Postgres/MinIO/Vault artifacts

## Primary Threats

1. Unauthorized file download
   - Mitigation: strict lifecycle/status checks + RBAC + share policy checks
2. Token theft/replay
   - Mitigation: short-lived access JWT + rotating refresh tokens + revocation
3. Malware bypass
   - Mitigation: quarantine + scan_pending gate; no download until clean
4. Key compromise or DEK leakage
   - Mitigation: per-file DEK, transit wrapping, no raw DEK at rest
5. Sensitive log leakage
   - Mitigation: structured logging policy, no secrets in logs
6. Weak local secrets handling
   - Mitigation: env-based secret config, .env.example only, bootstrap-generated values
7. Supply-chain or dependency risk
   - Mitigation: pinned versions and dependency audit baseline in CI
8. Backup artifact exposure
   - Mitigation: controlled backup location, documented retention and restore checks

## Abuse Cases

- Upload crafted filename/path traversal payload.
- Attempt download while file is quarantined/blocked.
- Replay old refresh token after rotation.
- Brute-force share token/password.
- Submit oversized or unsupported file types.
- Operate when Vault/ClamAV unavailable.

## Security Invariants (Must Hold)

1. Non-`active` files are never downloadable.
2. Every critical state transition emits audit record.
3. Passwords are never stored in plaintext.
4. No raw DEK persists in Postgres.
5. Refresh token rotation invalidates predecessor.
6. Missing critical dependencies fail safe, not open.

## Residual Risks (Prototype)

- Local dev Vault mode is weaker than production hardening.
- TLS trust model in local environment may rely on self-signed certs.
- Initial RBAC model may be coarse (`admin`/`member`) pending policy expansion.

## Planned Revisions

- Add data-flow diagram with concrete endpoint/job mapping for file + share workflows.
- Expand misuse case matrix tied to CI hardening in Phase 8.
- Add production-grade key custody and backup confidentiality controls beyond prototype assumptions.
