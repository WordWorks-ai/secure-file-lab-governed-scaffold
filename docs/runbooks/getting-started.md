# User Guide: Getting Started (Phase 8 Baseline)

## What This Repository Is

This project is a governed local prototype for secure file sharing with auth, encrypted upload/download flow, malware-gated activation, share policies, audit query/export, and operational backup/restore baseline.

## Current Scope

Implemented now:

- API auth + refresh/logout + RBAC baseline.
- File upload/download lifecycle with MinIO persistence and Vault transit DEK wrapping.
- Worker malware scan gate and lifecycle sweeps.
- Share link controls (expiry/password/usage/revocation).
- Audit event query and NDJSON export.
- Backup generation, restore smoke, and destructive live restore path.

Not implemented in v1 (intentional):

- Enterprise add-on services outside prototype scope (Keycloak/OPA/OpenSearch/OCR/realtime/admin split).

## Prerequisites

- Docker with Compose plugin.
- Node.js 22+.
- pnpm.

## First-Run Setup

1. Create local environment file.

```bash
cp .env.example .env
```

2. Generate an Argon2id admin password hash and set `BOOTSTRAP_ADMIN_PASSWORD_HASH` in `.env`.

```bash
pnpm --filter @sfl/api hash:password -- 'ChangeThisPassword'
```

3. Install dependencies.

```bash
pnpm install
```

4. Run validation suite.

```bash
make validate
```

5. Start and bootstrap.

```bash
make up
make bootstrap
```

## Verify Runtime

```bash
make health
curl -s http://localhost:8080/v1/health/live
curl -s http://localhost:8080/v1/health/ready
curl -s http://localhost:8080/v1/system/info
```

## Daily Operations

- Start stack: `make up`
- Stop stack: `make down`
- Tail logs: `make logs`
- Re-run bootstrap safely: `make bootstrap`
- Backup artifacts: `make backup`
- Restore smoke validation: `make restore-smoke`
- Live restore (destructive): `RESTORE_CONFIRM=YES make restore-live`
- Stack reset (destructive): `RESET_CONFIRM=YES make reset`

## Local URLs

- API via Caddy HTTP: `http://localhost:8080`
- API via Caddy HTTPS: `https://localhost:8443`
- MailHog UI: `http://localhost:8025`

## Troubleshooting

- If bootstrap fails on admin hash guard, generate a real Argon2id hash and retry.
- If readiness fails, inspect logs via `docker compose -f infra/compose/docker-compose.yml logs <service>`.
- If restore validation fails, regenerate backup and rerun `make restore-smoke` before any live restore.

## Related Runbooks

- `docs/runbooks/bootstrap.md`
- `docs/runbooks/backup-and-restore.md`
- `docs/runbooks/reset-bootstrap-restore.md`
- `docs/runbooks/vault-recovery.md`
