SHELL := /bin/bash

COMPOSE_FILE := infra/compose/docker-compose.yml

.PHONY: help install lint typecheck test test-unit test-integration test-scaffold test-hardening test-dependency-audit test-container-build test-ops-smoke validate compose-validate up down logs bootstrap health backup restore-smoke restore-live reset clean

help:
	@echo "Available targets:"
	@echo "  install          Install monorepo dependencies"
	@echo "  lint             Run lint across workspaces"
	@echo "  typecheck        Run typecheck across workspaces"
	@echo "  test             Run tests across workspaces"
	@echo "  test-unit        Run explicit unit-test suites"
	@echo "  test-integration Run explicit integration/e2e test suites"
	@echo "  test-scaffold    Run shell-based scaffold tests"
	@echo "  test-hardening   Run shell-based hardening baseline checks"
	@echo "  test-dependency-audit  Run dependency audit baseline (high severity gate)"
	@echo "  test-container-build   Validate docker image builds for api/worker"
	@echo "  test-ops-smoke   Run compose reproducibility smoke checks (destructive)"
	@echo "  validate         Run lint, typecheck, tests, compose validation"
	@echo "  up               Start docker compose stack"
	@echo "  down             Stop docker compose stack"
	@echo "  bootstrap        Run deterministic first-run bootstrap"
	@echo "  health           Run health checks"
	@echo "  backup           Generate local backup artifacts"
	@echo "  restore-smoke    Run restore smoke scaffold"
	@echo "  restore-live     Restore latest or selected backup into live postgres/minio (destructive)"
	@echo "  reset            Tear down stack + volumes with optional pre-backup (destructive)"

install:
	pnpm install

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test

test-unit:
	pnpm test:unit

test-integration:
	pnpm test:integration

test-scaffold:
	bash infra/scripts/tests/phase0-structure.sh
	bash infra/scripts/tests/bootstrap-scripts.sh
	bash infra/scripts/tests/phase1-compose.sh
	bash infra/scripts/tests/stage9-routing.sh
	bash infra/scripts/tests/stage10-policy.sh
	bash infra/scripts/tests/stage11-search.sh
	bash infra/scripts/tests/stage12-content.sh
	bash infra/scripts/tests/stage13-dlp.sh
	bash infra/scripts/tests/stage14-observability.sh
	bash infra/scripts/tests/stage15-webhook-sink.sh
	bash infra/scripts/tests/secrets-hygiene.sh
	bash infra/scripts/tests/env-loader-safety.sh
	bash infra/scripts/tests/scope-accuracy.sh
	bash infra/scripts/tests/backup-restore-guards.sh
	bash infra/scripts/tests/restore-live-guards.sh

test-hardening:
	bash infra/scripts/tests/hardening-baseline.sh
	bash infra/scripts/tests/env-loader-safety.sh
	bash infra/scripts/tests/scope-accuracy.sh
	bash infra/scripts/tests/backup-restore-guards.sh
	bash infra/scripts/tests/restore-live-guards.sh

test-dependency-audit:
	bash infra/scripts/tests/dependency-audit.sh

test-container-build:
	bash infra/scripts/tests/container-build-validation.sh

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

restore-live:
	./infra/scripts/restore-live.sh

reset:
	./infra/scripts/reset.sh

clean:
	rm -rf node_modules apps/api/node_modules apps/worker/node_modules packages/shared/node_modules
