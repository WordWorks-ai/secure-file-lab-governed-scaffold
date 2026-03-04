# Runbook: Bootstrap Local Environment

## Purpose

Provide deterministic first-run initialization for local prototype environment.

## Prerequisites

- Docker and Docker Compose plugin available.
- Node.js 22+ recommended (Node 20 may work for partial development tasks).
- pnpm installed.

## Steps

1. Prepare env:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
pnpm install
```

3. Start infrastructure and app services:

```bash
make up
```

4. Run deterministic bootstrap:

```bash
make bootstrap
```

Bootstrap performs:

- PostgreSQL readiness wait + Prisma migration execution.
- MinIO bucket creation for application object storage.
- Vault transit engine enablement and key creation.
- Local admin seed in idempotent manner.

## Verification Checks

- `docker compose -f infra/compose/docker-compose.yml ps`
- `make health`
- API health endpoint reports dependencies healthy.
- MinIO bucket exists.
- Vault transit key exists.
- Admin user appears exactly once.

## Idempotency Expectations

- Running `make bootstrap` repeatedly should not create duplicate admin users.
- Existing MinIO bucket should be accepted without failure.
- Existing Vault transit mount/key should be accepted without failure.

## Failure Handling

- If Vault setup fails: stop and fix; encryption-sensitive paths must remain disabled.
- If ClamAV is unhealthy: uploads may proceed to non-active states only.
- If migrations fail: do not continue with admin seed.

## Related Operations

- Destructive reset flow: `docs/runbooks/reset-bootstrap-restore.md`
- Backup/restore details: `docs/runbooks/backup-and-restore.md`
- Vault recovery constraints: `docs/runbooks/vault-recovery.md`
