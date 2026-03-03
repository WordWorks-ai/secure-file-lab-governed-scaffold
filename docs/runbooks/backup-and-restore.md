# Runbook: Backup and Restore (Prototype)

## Purpose

Define minimum viable backup and restore process for prototype governance.

## Backup Scope

- PostgreSQL logical dump (`pg_dump`).
- MinIO object mirror snapshot.
- Vault recovery approach documented for dev/prototype assumptions.

## Backup Command

```bash
make backup
```

Expected outputs in `./backups/<timestamp>/`:

- `postgres.sql`
- `minio/` object snapshot directory
- `manifest.json`
- `SHA256SUMS`

## Restore Smoke Command (Current)

```bash
make restore-smoke
```

Current restore smoke path:

1. Select latest backup directory.
2. Verify required artifacts exist (`postgres.sql`, `manifest.json`, `minio/`).
3. Restore `postgres.sql` into an ephemeral PostgreSQL container.
4. Verify DB query succeeds.
5. Verify checksums when `SHA256SUMS` is present.

## Vault Recovery Notes

Prototype mode may use dev initialization; production-grade unseal/shamir backup is out of v1. This limitation must stay explicit in docs and status reporting.

## Known Limitations (Current Scaffold)

- Restore smoke does **not** restore MinIO objects back into a running MinIO target.
- Restore smoke does **not** validate login/file-download business workflows because auth/file features are not implemented yet.
- Vault recovery is documentation-only in current scaffold.

## Failure Cases

- Missing backup artifact must fail with clear error.
- Corrupted DB/object backup must fail with clear error.
- Partial restore should not be marked successful.

## Retention (Prototype Default)

- Keep last 7 local backups.
- Rotation behavior handled in backup script.
