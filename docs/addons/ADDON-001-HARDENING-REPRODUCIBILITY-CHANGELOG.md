# Add-On 001: Hardening + Reproducibility Upgrade Changelog

- Add-on status: Delivered
- Add-on date: 2026-03-03
- Audience: Client stakeholders, security reviewers, technical buyers

## Add-On Purpose

Provide a higher-confidence Phase 0/1 infrastructure package by improving:

- environment safety controls in operational scripts
- deterministic dependency resolution in CI/container builds
- restore path SQL handling safety
- regression tests that enforce these controls continuously

This add-on improves delivery quality and reduces operational risk. It does not change Phase 2-6 feature scope.

## Changelog

1. Safe environment loading for scripts
- Added non-executing env parser helper: `infra/scripts/lib/env.sh`
- Replaced direct `.env` sourcing with `load_env_file` in:
  - `infra/scripts/bootstrap.sh`
  - `infra/scripts/backup.sh`
  - `infra/scripts/health.sh`
  - `infra/scripts/restore-smoke.sh`
  - `infra/scripts/tests/ops-reproducibility.sh`

2. Restore SQL safety hardening
- Removed direct SQL interpolation for restore DB name/user checks.
- Added `psql -v` variable usage and identifier-safe database creation via `format('%I', ...)` + `\gexec` in:
  - `infra/scripts/restore-smoke.sh`

3. Reproducibility hardening (lockfile enforced)
- Added `pnpm-lock.yaml` to repository.
- Switched install commands to frozen lockfile mode in:
  - `apps/api/Dockerfile`
  - `apps/worker/Dockerfile`
  - `.github/workflows/ci.yml`

4. Test and quality-gate expansion
- Added env parser safety test:
  - `infra/scripts/tests/env-loader-safety.sh`
- Extended guard tests to enforce:
  - lockfile presence
  - frozen lockfile install flags
  - no direct `.env` sourcing in infra scripts
  - mandatory use of `load_env_file` in key ops scripts
- Updated:
  - `infra/scripts/tests/hardening-baseline.sh`
  - `infra/scripts/tests/bootstrap-scripts.sh`
  - `infra/scripts/tests/phase0-structure.sh`
  - `Makefile`
  - `package.json`

## Validation Evidence

Validated with shell-based quality checks:

- `bash infra/scripts/tests/phase0-structure.sh`
- `bash infra/scripts/tests/bootstrap-scripts.sh`
- `bash infra/scripts/tests/secrets-hygiene.sh`
- `bash infra/scripts/tests/env-loader-safety.sh`
- `bash infra/scripts/tests/hardening-baseline.sh`
- `bash infra/scripts/tests/backup-restore-guards.sh`
- `docker compose --env-file .env.example -f infra/compose/docker-compose.yml config > /dev/null`

## Business Value Narrative (Client-Facing)

1. Lower operational risk
- Script execution no longer trusts `.env` as executable shell input.

2. Stronger delivery determinism
- CI and container builds are now lockfile-gated, reducing environment drift.

3. Better security posture for recovery workflows
- Restore SQL handling now uses safer variable/identifier patterns.

4. Higher confidence for handoff and procurement review
- Controls are tested and continuously enforced via explicit shell checks.

## Positioning For Conversation

Use this add-on as a quality and risk-reduction package:

- "We upgraded the infrastructure artifact from good scaffold to hardened, test-enforced scaffold."
- "This add-on reduces integration and security review friction before feature phases."
- "These upgrades increase handoff confidence without changing your future feature roadmap."

## Scope Boundary Reminder

Core application capabilities remain unchanged by this add-on:

- auth/session lifecycle
- file ingest/download workflows
- malware queue processors
- share-link policy runtime
- full runtime audit emission
