# ADR-002: File Lifecycle State Model and Transition Rules

- Status: Accepted
- Date: 2026-03-03
- Decision Makers: Engineering + Security

## Context

The prototype must enforce malware gating, authorization, and auditability across file ingest and distribution. This requires an explicit lifecycle model implemented in schema, domain logic, and worker processing.

## Decision

Adopt the following file states:

- `created`
- `stored`
- `quarantined`
- `scan_pending`
- `active`
- `blocked`
- `expired`
- `deleted`

### Transition Rules

1. Upload initiation creates metadata in `created`.
2. Successful encrypted object persistence moves to `stored`.
3. Post-persist policy gate moves to `quarantined`.
4. Queue submission moves to `scan_pending`.
5. Worker scan result:
   - clean -> `active`
   - infected/unknown-risk -> `blocked`
6. Policy/time-based lifecycle job can move eligible files to `expired`.
7. Deletion operations transition to `deleted` (hard purge handled separately by cleanup policy).

### Access Rules

- Download is allowed only when file is `active` and caller authorization/policy passes.
- Any non-`active` status must be denied by centralized authorization logic.

### Audit Requirements

Every critical transition emits audit event with actor/context:

- upload initiated
- encryption persisted
- queue submitted
- scan completed (clean/infected)
- activation
- blocking
- expiration
- deletion
- download attempts and outcomes

## Rationale

- Explicit states prevent ambiguous access conditions.
- Quarantine and scan pending states are mandatory control points.
- Transition-level auditing enables governance and incident analysis.

## Consequences

- Domain logic must validate allowed transitions.
- APIs and workers must be coordinated to avoid illegal state mutations.
- Tests must assert transition legality and download gating behavior.

## Alternatives Considered

1. Binary file status (`available` / `unavailable`)
   - Rejected as insufficient for malware-gate and audit requirements.

2. Immediate scan in API request thread
   - Rejected due to latency and resilience concerns; async worker is safer and more scalable.

## Follow-Up Decisions

- ADR-003 defines encryption/dek handling and how transitions map to encrypted storage semantics.
