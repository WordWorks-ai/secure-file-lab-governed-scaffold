# Phase 01 Status - Local Infrastructure and Deterministic Bootstrap

- Status: Completed
- Started: 2026-03-03
- Completed: 2026-03-03

## Summary

Phase 1 delivered a deterministic local infrastructure scaffold for required v1 services:

- compose topology for `caddy`, `api`, `worker`, `postgres`, `redis`, `minio`, `vault`, `clamav`, `mailhog`, `backup`
- named volumes and health checks
- env template and bootstrap automation
- Prisma migration deploy during bootstrap
- MinIO bucket initialization
- Vault transit setup
- idempotent admin seed flow
- backup artifact generation scaffold and restore-smoke scaffold

## Files Added/Changed

### Infrastructure topology

- `infra/compose/docker-compose.yml`
- `infra/caddy/Caddyfile`
- `.env.example`

### Bootstrap and operations scripts

- `infra/scripts/bootstrap.sh`
- `infra/scripts/lib/wait-for-health.sh`
- `infra/scripts/minio-init.sh`
- `infra/scripts/vault-init.sh`
- `infra/scripts/seed-admin.sh`
- `infra/scripts/health.sh`
- `infra/scripts/backup.sh`
- `infra/scripts/restore-smoke.sh`

### Database bootstrap via Prisma

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260303110000_phase1_init/migration.sql`
- `apps/api/prisma/migrations/20260303123000_uuid_defaults/migration.sql`

### Container build/runtime

- `apps/api/Dockerfile`
- `apps/worker/Dockerfile`

## Commands Run

### Compose and startup validation

- `docker compose --env-file .env.example -f infra/compose/docker-compose.yml config >/dev/null`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml up -d postgres redis minio vault clamav mailhog`
- `DOCKER_BUILDKIT=0 docker compose --env-file .env -f infra/compose/docker-compose.yml up -d --build api worker caddy backup`
- `docker compose --env-file .env -f infra/compose/docker-compose.yml ps`
- `./infra/scripts/health.sh`

### Bootstrap and first-run flow

- `./infra/scripts/bootstrap.sh`
- Verified migration application logs from `prisma migrate deploy`
- Verified MinIO bootstrap bucket creation (`secure-files`)
- Verified Vault transit key presence (`vault-key-ok`)
- Idempotency check:
  - `./infra/scripts/seed-admin.sh`
  - SQL count verification for seeded admin email returned `1`

### Backup/restore scaffold checks

- `./infra/scripts/backup.sh` (generated `backups/<timestamp>/` with postgres dump + minio mirror + manifest)
- `./infra/scripts/restore-smoke.sh` (validated backup discovery path)

## Tests Added

- `infra/scripts/tests/phase1-compose.sh`
- Bootstrap script checks in `infra/scripts/tests/bootstrap-scripts.sh`

## Test Results

- Compose config validation: pass
- Required service presence in compose: pass
- Runtime health (`docker compose ps` + `infra/scripts/health.sh`): pass for all required v1 services
- Bootstrap end-to-end: pass
  - migrations applied
  - bucket init pass
  - vault transit key created
  - admin seed pass
- Admin seed idempotency check: pass (count stays `1`)
- Backup generation scaffold: pass
- Restore smoke scaffold: pass (placeholder behavior documented)

## Architecture Decisions Made

- Compose project name fixed (`secure_file_lab`) for stable network/volume naming.
- ClamAV pinned to `platform: linux/amd64` for Apple Silicon compatibility in this environment.
- Vault healthcheck switched to `vault status` for deterministic health reporting.
- Bootstrap uses `DOCKER_BUILDKIT=0` due BuildKit session-header incompatibility in this workspace path context.
- Prisma migration deploy chosen as canonical bootstrap migration mechanism.

## Issues Encountered and Resolved

1. `clamav/clamav:1.4` lacked arm64 manifest.
   - Resolution: force `platform: linux/amd64` for `clamav` service.

2. Vault healthcheck remained `starting` with raw `/v1/sys/health` probe behavior.
   - Resolution: use `vault status` healthcheck command.

3. BuildKit error on compose build (`x-docker-expose-session-sharedkey` non-printable chars).
   - Resolution: use classic builder path (`DOCKER_BUILDKIT=0`) in bootstrap/build commands.

4. API/worker runtime startup failures (`reflect-metadata`, then `class-validator`, then build output path mismatch).
   - Resolution:
     - Dockerfiles simplified to single-stage with full workspace install/build.
     - added `class-validator` and `class-transformer`.
     - adjusted TypeScript config split (`rootDir` for build vs typecheck).

5. Bootstrap admin seed failed due missing UUID default in initial migration.
   - Resolution:
     - added Prisma migration `20260303123000_uuid_defaults`.
     - seed SQL updated to use `gen_random_uuid()` explicitly.

6. Backup script MinIO client invocation failed due image entrypoint semantics.
   - Resolution: call `minio/mc` with `--entrypoint /bin/sh` and `-c` command sequence.

## Assumptions Made

- Local Vault dev mode is acceptable for prototype bootstrap in Phase 1.
- Backup/restore in this phase is scaffold-level and not full fidelity recovery.
- Host-level npm installation may fail due external DNS restrictions; containerized validation is authoritative for this phase run.

## Deferred Items and Why

- Full restore execution into clean environment with workflow verification deferred to Phase 7 by plan.
- Full API feature behavior (auth/files/shares/audit) deferred to Phases 2-6.
- Production-grade Vault initialization/unseal/backup process deferred; current setup is explicitly dev-mode.
