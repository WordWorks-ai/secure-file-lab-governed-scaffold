# Contributing Guide

## Scope And Expectations

This repository is a governed scaffold for a secure file sharing platform.

Contributions should strengthen implementation quality and move planned modules forward (`auth`, `users_orgs`, `files`, `shares`, `audit`) without bypassing documented security and architecture constraints.

## Prerequisites

- Docker + Compose plugin
- Node.js 22+
- pnpm

## Local Setup

1. Copy env template.

```bash
cp .env.example .env
```

2. Set bootstrap admin hash (Argon2id).

```bash
pnpm --filter @sfl/api hash:password -- 'ChangeThisPassword'
```

3. Install dependencies.

```bash
pnpm install
```

4. Validate baseline.

```bash
make validate
```

5. Start and bootstrap local environment.

```bash
make up
make bootstrap
```

## Repository Map

- `apps/api`: NestJS API modules and Prisma schema.
- `apps/worker`: NestJS worker modules and async jobs.
- `packages/shared`: shared domain helpers/types.
- `infra/compose`: compose topology.
- `infra/scripts`: deterministic bootstrap/ops scripts and shell tests.
- `docs/adr`: architecture decisions.
- `docs/status`: phase evidence/status tracking.
- `docs/runbooks`: operator/developer runbooks.

## Recommended Feature Workflow

1. Confirm feature scope and target module boundaries.
2. Update persistence model in `apps/api/prisma/schema.prisma`.
3. Add Prisma migration under `apps/api/prisma/migrations`.
4. Implement API module/controller/service in `apps/api/src/modules/<feature>`.
5. Add worker job processors in `apps/worker/src/modules/jobs` when work is asynchronous.
6. Move reusable business rules into `packages/shared` only when shared by API and worker.
7. Add or update tests:
   - unit tests for business logic
   - API e2e tests for routes/contracts
   - worker tests for job behavior
8. Update docs:
   - ADR for architecture/security-sensitive changes
   - runbooks for operational flow changes
   - phase status evidence in `docs/status`

## Quality Gates

Run before opening or updating a PR:

```bash
make validate
```

Run additional checks when relevant:

```bash
pnpm run test:hardening
pnpm run test:ops-smoke
```

## Security Rules

- Never commit real credentials, tokens, or private keys.
- Keep `.env` local and out of commits.
- Use `.env.example` placeholders only.
- Do not log secrets, token material, or sensitive payloads.
- Preserve explicit file lifecycle states and do not skip quarantine/scan gates in future file workflows.

## Contribution DoD (Definition of Done)

- Feature behavior is covered by tests.
- `make validate` passes locally.
- Security and architecture implications are documented.
- New environment variables are added to `.env.example` with safe placeholders.
- Relevant runbooks/status docs are updated.

## Pull Request Notes

In PR descriptions, include:

- Problem statement and scope.
- Technical approach and module boundaries touched.
- Test evidence (commands run and outcomes).
- Security/governance impact and doc updates.

## License Note

Repository-owned materials are source-available under Elastic License 2.0.
Review `LICENSE` and `NOTICE` before reusing or redistributing.
