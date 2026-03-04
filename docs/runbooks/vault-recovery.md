# Runbook: Vault Recovery Guidance (Prototype)

## Purpose

Document recovery expectations and operator actions for Vault in this prototype environment.

## Scope and Limitations

- This prototype uses Vault transit for DEK wrap/unwrap operations.
- Local development commonly runs Vault in dev mode with a static dev token from `.env`.
- Production-grade Shamir key custody, auto-unseal, and formal secret rotation are out of v1 scope.

## What Recovery Means in This Prototype

- If Vault data persists and token/key config is unchanged:
  - restart Vault service
  - verify transit mount and key still exist
  - resume operations
- If Vault data is lost (volume reset) and transit key is recreated:
  - previously wrapped DEKs become unreadable
  - encrypted file payloads tied to old wrapped keys are not recoverable through app workflows
  - corresponding data must be restored from compatible backups or re-uploaded

## Verification Commands

Check Vault status and transit mount/key after bootstrap:

```bash
docker compose -f infra/compose/docker-compose.yml --env-file .env exec -T vault sh -lc 'VAULT_ADDR=$VAULT_ADDR VAULT_TOKEN=$VAULT_DEV_ROOT_TOKEN vault status'
docker compose -f infra/compose/docker-compose.yml --env-file .env exec -T vault sh -lc 'VAULT_ADDR=$VAULT_ADDR VAULT_TOKEN=$VAULT_DEV_ROOT_TOKEN vault secrets list'
docker compose -f infra/compose/docker-compose.yml --env-file .env exec -T vault sh -lc 'VAULT_ADDR=$VAULT_ADDR VAULT_TOKEN=$VAULT_DEV_ROOT_TOKEN vault read transit/keys/$VAULT_TRANSIT_KEY_NAME'
```

## Recovery Decision Matrix

- Vault healthy and key present:
  - no destructive action needed
  - continue normal operations
- Vault unhealthy but volume intact:
  - restart stack (`make down`, `make up`)
  - run `make health`
  - if still failing, inspect Vault logs
- Vault volume lost/reset:
  - run `make bootstrap` to recreate transit mount/key
  - restore data from backups with `make restore-smoke` then `RESTORE_CONFIRM=YES make restore-live`
  - expect unrecoverable encrypted records if no compatible backup exists

## Operational Guidance

- Treat Vault and data backups as a coupled recovery domain.
- Run `make backup` before destructive maintenance.
- Keep this limitation explicit in status docs until production-grade key custody is implemented.
