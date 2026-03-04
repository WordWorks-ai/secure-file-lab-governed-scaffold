# User Guide: Getting Started (Phase 8 + Stage 12 Baseline)

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

- Enterprise add-on services outside prototype scope (Keycloak/OPA/OpenSearch/realtime/admin split).

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
- Start optional enterprise profile (Keycloak/OPA): `docker compose -f infra/compose/docker-compose.yml --env-file .env --profile enterprise up -d keycloak opa`
- Start optional search profile (OpenSearch): `docker compose -f infra/compose/docker-compose.yml --env-file .env --profile search up -d opensearch opensearch_dashboards`
- Start optional content profile (Preview/OCR): `docker compose -f infra/compose/docker-compose.yml --env-file .env --profile content up -d preview ocr`
- Stop stack: `make down`
- Tail logs: `make logs`
- Re-run bootstrap safely: `make bootstrap`
- Backup artifacts: `make backup`
- Restore smoke validation: `make restore-smoke`
- Live restore (destructive): `RESTORE_CONFIRM=YES make restore-live`
- Stack reset (destructive): `RESET_CONFIRM=YES make reset`

## Local URLs

- Web shell via Caddy HTTP: `http://localhost:8080`
- Web shell via Caddy HTTPS: `https://localhost:8443`
- API via Caddy HTTP: `http://localhost:8080/v1`
- API via Caddy HTTPS: `https://localhost:8443/v1`
- Admin shell via Caddy: `http://localhost:8080/admin/`
- Realtime health via Caddy: `http://localhost:8080/realtime/health/live`
- Search API via Caddy: `http://localhost:8080/v1/search/files?q=<query>`
- MailHog UI: `http://localhost:8025`
- OpenSearch API (profile): `http://localhost:9200`
- OpenSearch Dashboards (profile): `http://localhost:5601`
- Preview service (profile): `http://localhost:3011/v1/preview`
- OCR service (profile): `http://localhost:3012/v1/ocr`

## Troubleshooting

- If bootstrap fails on admin hash guard, generate a real Argon2id hash and retry.
- If readiness fails, inspect logs via `docker compose -f infra/compose/docker-compose.yml logs <service>`.
- If restore validation fails, regenerate backup and rerun `make restore-smoke` before any live restore.

## Related Runbooks

- `docs/runbooks/bootstrap.md`
- `docs/runbooks/backup-and-restore.md`
- `docs/runbooks/reset-bootstrap-restore.md`
- `docs/runbooks/vault-recovery.md`
