SHELL := /bin/bash

COMPOSE_FILE := infra/compose/docker-compose.yml

.PHONY: help install lint typecheck test test-scaffold test-hardening test-ops-smoke validate compose-validate up down logs bootstrap health backup restore-smoke clean

help:
	@echo "Available targets:"
	@echo "  install          Install monorepo dependencies"
	@echo "  lint             Run lint across workspaces"
	@echo "  typecheck        Run typecheck across workspaces"
	@echo "  test             Run tests across workspaces"
	@echo "  test-scaffold    Run shell-based scaffold tests"
	@echo "  test-hardening   Run shell-based hardening baseline checks"
	@echo "  test-ops-smoke   Run compose reproducibility smoke checks (destructive)"
	@echo "  validate         Run lint, typecheck, tests, compose validation"
	@echo "  up               Start docker compose stack"
	@echo "  down             Stop docker compose stack"
	@echo "  bootstrap        Run deterministic first-run bootstrap"
	@echo "  health           Run health checks"
	@echo "  backup           Generate local backup artifacts"
	@echo "  restore-smoke    Run restore smoke scaffold"

install:
	pnpm install

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test

test-scaffold:
	bash infra/scripts/tests/phase0-structure.sh
	bash infra/scripts/tests/bootstrap-scripts.sh
	bash infra/scripts/tests/phase1-compose.sh
	bash infra/scripts/tests/secrets-hygiene.sh
	bash infra/scripts/tests/env-loader-safety.sh
	bash infra/scripts/tests/scope-accuracy.sh
	bash infra/scripts/tests/backup-restore-guards.sh

test-hardening:
	bash infra/scripts/tests/hardening-baseline.sh
	bash infra/scripts/tests/env-loader-safety.sh
	bash infra/scripts/tests/scope-accuracy.sh
	bash infra/scripts/tests/backup-restore-guards.sh

test-ops-smoke:
	bash infra/scripts/tests/ops-reproducibility.sh

compose-validate:
	docker compose --env-file .env.example -f $(COMPOSE_FILE) config > /dev/null

validate: lint typecheck test test-scaffold compose-validate

up:
	DOCKER_BUILDKIT=0 docker compose -f $(COMPOSE_FILE) --env-file .env up -d --build

down:
	docker compose -f $(COMPOSE_FILE) --env-file .env down

logs:
	docker compose -f $(COMPOSE_FILE) logs -f --tail=200

bootstrap:
	./infra/scripts/bootstrap.sh

health:
	./infra/scripts/health.sh

backup:
	./infra/scripts/backup.sh

restore-smoke:
	./infra/scripts/restore-smoke.sh

clean:
	rm -rf node_modules apps/api/node_modules apps/worker/node_modules packages/shared/node_modules
