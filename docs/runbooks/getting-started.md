# User Guide: Getting Started (Phase 1 Scaffold)

## What This Repository Is

This project is a governed scaffold for a self-hosted secure file sharing platform.

As of March 3, 2026, it provides infrastructure/bootstrap foundations and health checks, but does not yet implement complete end-user file sharing flows.

## What You Can Use Today

- Deterministic local stack startup via Docker Compose.
- Deterministic bootstrap for PostgreSQL migration, MinIO bucket init, Vault transit key setup, and admin seed.
- API and worker health/readiness endpoints.
- Backup generation and restore smoke checks.

## What Is Not Implemented Yet

- Login/logout/session lifecycle and RBAC enforcement.
- File upload/download APIs backed by object persistence and authorization.
- Runtime envelope encryption/decryption in file request flows.
- Malware-scan-gated file activation pipeline.
- Share-link endpoints and full runtime audit trails.

## Prerequisites

- Docker with Compose plugin.
- Node.js 22+.
- pnpm.

## First-Run Setup

1. Create local environment file.

```bash
cp .env.example .env
```

2. Generate a bootstrap admin password hash and place it in `.env` as `BOOTSTRAP_ADMIN_PASSWORD_HASH`.

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

5. Start the platform.

```bash
make up
```

6. Run deterministic bootstrap.

```bash
make bootstrap
```

## Verify It Is Running

1. Check health script output.

```bash
make health
```

2. Check API liveness (through Caddy).

```bash
curl -s http://localhost:8080/v1/health/live
```

3. Check API readiness (through Caddy).

```bash
curl -s http://localhost:8080/v1/health/ready
```

4. Check scaffold phase info.

```bash
curl -s http://localhost:8080/v1/system/info
```

## Daily Operations

- Start stack: `make up`
- Stop stack: `make down`
- Tail logs: `make logs`
- Re-run bootstrap safely: `make bootstrap`
- Backup artifacts: `make backup`
- Restore smoke: `make restore-smoke`

## Local URLs

- API via Caddy HTTP: `http://localhost:8080`
- API via Caddy HTTPS: `https://localhost:8443`
- MailHog UI: `http://localhost:8025`

## Troubleshooting

- If bootstrap fails with admin hash errors, ensure `BOOTSTRAP_ADMIN_PASSWORD_HASH` is Argon2id output from `pnpm --filter @sfl/api hash:password`.
- If readiness fails, inspect service logs with `docker compose -f infra/compose/docker-compose.yml logs <service>`.
- If migrations fail, fix schema/migration issues and rerun `make bootstrap`.

## Next Step

To extend capabilities (auth/files/shares/audit), follow the contribution workflow in [`CONTRIBUTING.md`](../../CONTRIBUTING.md).
