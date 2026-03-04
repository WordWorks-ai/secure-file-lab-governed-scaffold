# Runbook: Local Development

## Setup

1. Copy env file:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
pnpm install
```

3. Validate static checks:

```bash
make validate
```

4. Start stack and bootstrap:

```bash
make up
make bootstrap
```

## Daily Commands

- `make up` / `make down`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:dependency-audit`
- `pnpm test:container-build`
- `make backup`
- `make restore-smoke`
- `RESTORE_CONFIRM=YES make restore-live` (destructive)
- `RESET_CONFIRM=YES make reset` (destructive)
- `pnpm --filter @sfl/api start:dev`
- `pnpm --filter @sfl/worker start:dev`

## Contribution Expectations

- Update docs/ADR when changing architecture/security-sensitive behavior.
- Add tests for every new capability.
- Keep domain boundaries explicit; avoid cross-module shortcuts.
- Record phase progress in `docs/status`.

## Security Hygiene

- Never commit real secrets.
- Use `.env.example` placeholders only.
- Avoid logging sensitive payloads or tokens.
- Keep temp plaintext usage minimal and ephemeral.

## Troubleshooting

- If compose services fail health checks, inspect logs via `docker compose logs <service>`.
- If migrations fail, rerun bootstrap after fixing schema/migration issues.
- If queue jobs are stuck, verify Redis and worker connectivity.
