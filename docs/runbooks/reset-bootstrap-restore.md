# Runbook: Reset, Bootstrap, and Restore Operations

## Purpose

Provide a deterministic operator sequence for destructive reset, clean bootstrap, and optional live data restore.

## Safety Rules

- Never run destructive commands without a current backup.
- Use explicit confirmations:
  - `RESET_CONFIRM=YES` for reset.
  - `RESTORE_CONFIRM=YES` for live restore.
- Validate backup integrity with `make restore-smoke` before live restore.

## Common Workflows

## 1) Clean Reset (Preserve Backups)

```bash
RESET_CONFIRM=YES make reset
```

Default behavior:

- takes pre-reset backup when Postgres and MinIO are running
- runs `docker compose down -v --remove-orphans`
- keeps existing `./backups` artifacts

## 2) Clean Reset (Delete Existing Backups Too)

```bash
RESET_CONFIRM=YES RESET_DELETE_BACKUPS=true make reset
```

Use only when intentionally discarding all local backup artifacts.

## 3) Reset + Start Fresh Stack + Bootstrap

```bash
RESET_CONFIRM=YES RESET_START_STACK=true RESET_BOOTSTRAP_AFTER_START=true make reset
```

This runs a full clean-state bring-up for local reproducibility checks.

## 4) Live Restore Into Running Stack

1. Ensure stack is up and healthy.
2. Verify backup using smoke restore.
3. Run destructive live restore.

```bash
make restore-smoke
RESTORE_CONFIRM=YES make restore-live
```

To target a specific backup:

```bash
RESTORE_CONFIRM=YES BACKUP_DIR=20260304-120000 make restore-live
```

## 5) Standard Bootstrap (Non-Reset Path)

```bash
make up
make bootstrap
make health
```

## Recommended Operator Sequence

For incident recovery or deterministic local rebuild:

1. `make backup`
2. `make restore-smoke`
3. `RESET_CONFIRM=YES make reset`
4. `make up`
5. `make bootstrap`
6. `RESTORE_CONFIRM=YES make restore-live` (if restoring data)
7. `make health`
