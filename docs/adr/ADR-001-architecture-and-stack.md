# ADR-001: Architecture and Stack for Governed Prototype

- Status: Accepted
- Date: 2026-03-03
- Decision Makers: Engineering + Security

## Context

The project requires a self-hosted secure file sharing prototype that demonstrates core controls without introducing enterprise-scale complexity. The repository starts from zero implementation and must prioritize deterministic local operations and governance.

## Decision

Adopt a monorepo with pnpm workspaces and TypeScript, with two primary applications:

- `apps/api`: NestJS modular monolith (Fastify adapter)
- `apps/worker`: NestJS process dedicated to asynchronous jobs

Data and infrastructure choices:

- PostgreSQL as authoritative relational datastore
- Redis for BullMQ job backend and optional transient token/session utility
- MinIO for object storage (S3-compatible)
- Vault transit for key wrapping (DEK wrap/unwrap)
- ClamAV (`clamd`) for malware scanning
- MailHog for local SMTP capture
- Caddy for edge routing and local TLS termination
- Docker Compose for deterministic local orchestration

Testing strategy baseline:

- Unit tests for pure logic and state transitions
- API tests with Supertest
- Integration tests with Testcontainers where practical
- Compose-based smoke checks for service topology

## Rationale

- Modular monolith reduces coordination complexity while retaining domain boundaries.
- Separate worker enforces clear async boundary without over-fragmenting services.
- Selected components are broadly understood, self-host-friendly, and align with v1 requirements.
- Compose and scripted bootstrap provide reproducibility and explicit operational behavior.

## Consequences

Positive:

- Fast iteration with clear boundaries.
- Security-critical infrastructure available from day one.
- Clear path to incremental hardening.

Trade-offs:

- Single API deployment unit may grow in complexity over time.
- Local Vault bootstrap in prototype mode is less representative than hardened production operations.
- Integration tests involving external services add runtime and setup complexity.

## Alternatives Considered

1. Microservice-first architecture
   - Rejected for v1 due to high coordination overhead and limited validation value.

2. Managed cloud services instead of self-hosted components
   - Rejected due to project objective of self-hosted governed prototype.

3. Presigned-upload-first design from the beginning
   - Deferred. v1 favors app-managed upload path for stronger lifecycle and audit control.

## Follow-Up Decisions

- ADR-002 defines file lifecycle state machine and transition controls.
- ADR-003 defines encryption and key management model.
