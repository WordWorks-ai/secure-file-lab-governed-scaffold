# Runbook: Backup and Restore (Prototype Ops Baseline)

## Purpose

Define deterministic local backup/restore procedures for PostgreSQL + MinIO and an operator-safe live restore path.

## Backup Scope

- PostgreSQL logical dump (`postgres.sql`).
- MinIO bucket mirror (`minio/` directory).
- Backup integrity metadata (`SHA256SUMS`, `manifest.json`).
- Vault recovery is documentation-only for prototype mode; see `docs/runbooks/vault-recovery.md`.

## Prerequisites

- `.env` exists and includes Postgres/MinIO variables.
- Compose stack is running for backup and live restore workflows.
- Operator understands live restore is destructive for current Postgres + MinIO state.

## Backup Command

```bash
make backup
```

Expected output directory:

- `./backups/<timestamp>/postgres.sql`
- `./backups/<timestamp>/minio/`
- `./backups/<timestamp>/SHA256SUMS`
- `./backups/<timestamp>/manifest.json`

Backup safety controls:

- requires required env vars
- rejects `BACKUP_ROOT=/`
- keeps backup directory inside `BACKUP_ROOT`
- rotates old backups based on `RETENTION_COUNT` (default `7`)

## Restore Smoke (Non-Destructive to Live Stack)

```bash
make restore-smoke
```

What it verifies:

1. Backup artifact shape is valid.
2. Optional checksum file validates.
3. `postgres.sql` restores into an ephemeral PostgreSQL container.
4. `minio/` restores into an ephemeral MinIO container.
5. DB connectivity and MinIO object parity checks pass.

Use this before any live restore.

## Live Restore (Destructive)

Default behavior restores from latest backup directory into running compose `postgres` and `minio`.

```bash
RESTORE_CONFIRM=YES make restore-live
```

Restore from a specific backup directory:

```bash
RESTORE_CONFIRM=YES BACKUP_DIR=20260304-120000 make restore-live
```

Optional controls:

- `RESTORE_STOP_APP_SERVICES=true|false` (default `true`) to stop/restart `api` and `worker` during restore.
- `BACKUP_ROOT` to point at a non-default backup location.

Live restore safety controls:

- requires `RESTORE_CONFIRM=YES`
- rejects `BACKUP_ROOT=/`
- requires `BACKUP_DIR` to remain inside `BACKUP_ROOT`
- requires `postgres.sql`, `manifest.json`, `minio/`
- verifies checksums when `SHA256SUMS` exists
- verifies MinIO object count parity after restore

## Failure Handling

- Any missing artifact or checksum mismatch must fail restore.
- Live restore must not report success if Postgres replay or MinIO parity check fails.
- If app services were stopped by restore, script attempts restart and health wait before exit.

## Retention

- Default local retention is last `7` backups.
- Configure with `RETENTION_COUNT=<n>`.
