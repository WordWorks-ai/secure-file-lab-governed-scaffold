# ADR-003: Envelope Encryption and Vault Transit Integration

- Status: Accepted
- Date: 2026-03-03
- Decision Makers: Engineering + Security

## Context

The prototype must avoid storing plaintext objects and must demonstrate explicit key-management controls suitable for future hardening.

## Decision

Use envelope encryption for file objects:

- Generate a unique Data Encryption Key (DEK) per file.
- Encrypt file payload in application path before persistence to MinIO.
- Never persist raw DEK in database.
- Wrap DEK through Vault transit and store wrapped DEK alongside file metadata.
- Unwrap DEK via transit only during authorized decrypt/download path.

### Storage Model (planned)

File metadata in Postgres includes:

- object key
- encryption algorithm and version
- wrapped DEK
- iv/nonce metadata
- auth tag metadata (if algorithm requires)
- state/lifecycle metadata

### Temporary Plaintext Handling

- Prefer streaming pipeline to reduce plaintext-at-rest surface.
- If temporary files are required:
  - place in isolated temp directory
  - apply strict permissions
  - delete immediately after encryption/scan stage
  - run cleanup job for orphan artifacts

### Vault Mode

- v1 uses Vault transit for key wrapping operations.
- KV secrets may be used for non-cryptographic app secrets in dev, but encryption key operations are transit-only.

## Rationale

- Per-file DEKs limit blast radius.
- Transit wrap/unwrap demonstrates key separation between storage and control plane.
- Metadata model supports future key rotation and auditability.

## Consequences

- API and worker must coordinate wrap/unwrap calls and failure handling.
- Vault availability must be treated as a critical dependency for encryption paths.
- Integration tests must include Vault-unavailable fail-safe behavior.

## Alternatives Considered

1. MinIO server-side encryption only
   - Rejected because it does not demonstrate explicit application-controlled envelope encryption model.

2. Single shared DEK for all files
   - Rejected due to unacceptable blast radius and poor governance posture.

3. Storing raw DEK encrypted with app secret
   - Rejected because Vault transit is required for separation of duties.
