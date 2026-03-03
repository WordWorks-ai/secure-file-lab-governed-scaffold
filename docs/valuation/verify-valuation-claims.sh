#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Valuation Evidence Verification Script (v2 — Authorship Model)
# =============================================================================
# This script programmatically verifies the factual claims made in the
# Independent Valuation Report (v2). Every assertion below corresponds to a
# specific claim in the report. Failures indicate the report's evidence
# basis has changed and the valuation should be re-examined.
# =============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/compose/docker-compose.yml"
PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "  PASS: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1" >&2; }

check_file() {
  if [[ -f "$ROOT_DIR/$1" ]]; then
    pass "file exists: $1"
  else
    fail "file missing: $1"
  fi
}

check_dir() {
  if [[ -d "$ROOT_DIR/$1" ]]; then
    pass "directory exists: $1"
  else
    fail "directory missing: $1"
  fi
}

check_pattern() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if grep -Fq "$pattern" "$ROOT_DIR/$file" 2>/dev/null; then
    pass "$label"
  else
    fail "$label (pattern not found in $file)"
  fi
}

check_pattern_regex() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if grep -Eq "$pattern" "$ROOT_DIR/$file" 2>/dev/null; then
    pass "$label"
  else
    fail "$label (regex not found in $file)"
  fi
}

echo "========================================"
echo "Valuation Evidence Verification (v2)"
echo "Authorship Model Claims"
echo "========================================"
echo ""

# ---------------------------------------------------------------------------
echo "--- Section B: Authorship Production Model Evidence ---"
# ---------------------------------------------------------------------------

# Claim: Cursor IDE metadata directory exists
if [[ -d "$ROOT_DIR/.git/cursor" ]]; then
  pass "Cursor IDE metadata directory exists (.git/cursor/)"
else
  fail "Cursor IDE metadata directory not found"
fi

# Claim: All commits fall within a single day (2026-03-03)
commit_dates="$(git -C "$ROOT_DIR" log --all --format='%ad' --date=short | sort -u)"
commit_date_count="$(echo "$commit_dates" | wc -l | tr -d '[:space:]')"
if [[ "$commit_date_count" -eq 1 ]]; then
  pass "All commits on single date: $(echo "$commit_dates" | tr -d '[:space:]')"
else
  fail "Commits span multiple dates (expected 1 date, found $commit_date_count)"
fi

# Claim: All commits within ~3 hour window
earliest_epoch="$(git -C "$ROOT_DIR" log --all --format='%at' | sort -n | head -1)"
latest_epoch="$(git -C "$ROOT_DIR" log --all --format='%at' | sort -n | tail -1)"
elapsed_hours=$(( (latest_epoch - earliest_epoch) / 3600 ))
if [[ "$elapsed_hours" -le 4 ]]; then
  pass "All commits within ${elapsed_hours}h window (claimed ~3h)"
else
  fail "Commit window is ${elapsed_hours}h (expected <=4h)"
fi

# Claim: Initial commit has ~84 files
initial_commit="$(git -C "$ROOT_DIR" rev-list --max-parents=0 HEAD | head -1)"
initial_file_count="$(git -C "$ROOT_DIR" show --stat --format='' "$initial_commit" | grep -c '|' || true)"
if [[ "$initial_file_count" -ge 75 && "$initial_file_count" -le 95 ]]; then
  pass "Initial commit file count: $initial_file_count (claimed ~84)"
else
  fail "Initial commit file count: $initial_file_count (expected ~84)"
fi

echo ""

# ---------------------------------------------------------------------------
echo "--- Section C: Application Code Artifacts ---"
# ---------------------------------------------------------------------------

# Claim: apps/api/src has ~6 source files
api_src_count="$(find "$ROOT_DIR/apps/api/src" -type f -name '*.ts' | wc -l | tr -d '[:space:]')"
if [[ "$api_src_count" -ge 5 && "$api_src_count" -le 8 ]]; then
  pass "API src file count: $api_src_count (claimed ~6)"
else
  fail "API src file count: $api_src_count (expected ~6)"
fi

# Claim: apps/worker/src has ~5 source files
worker_src_count="$(find "$ROOT_DIR/apps/worker/src" -type f -name '*.ts' | wc -l | tr -d '[:space:]')"
if [[ "$worker_src_count" -ge 4 && "$worker_src_count" -le 7 ]]; then
  pass "Worker src file count: $worker_src_count (claimed ~5)"
else
  fail "Worker src file count: $worker_src_count (expected ~5)"
fi

# Claim: packages/shared/src has 2 source files
shared_src_count="$(find "$ROOT_DIR/packages/shared/src" -type f -name '*.ts' | wc -l | tr -d '[:space:]')"
if [[ "$shared_src_count" -eq 2 ]]; then
  pass "Shared src file count: $shared_src_count (claimed 2)"
else
  fail "Shared src file count: $shared_src_count (expected 2)"
fi

# Claim: No auth module exists
if [[ -d "$ROOT_DIR/apps/api/src/modules/auth" ]]; then
  fail "Auth module directory exists (report claims not implemented)"
else
  pass "No auth module directory (confirms not implemented)"
fi

# Claim: No files module exists
if [[ -d "$ROOT_DIR/apps/api/src/modules/files" ]]; then
  fail "Files module directory exists (report claims not implemented)"
else
  pass "No files module directory (confirms not implemented)"
fi

# Claim: No shares module exists
if [[ -d "$ROOT_DIR/apps/api/src/modules/shares" ]]; then
  fail "Shares module directory exists (report claims not implemented)"
else
  pass "No shares module directory (confirms not implemented)"
fi

# Claim: No audit module exists
if [[ -d "$ROOT_DIR/apps/api/src/modules/audit" ]]; then
  fail "Audit module directory exists (report claims not implemented)"
else
  pass "No audit module directory (confirms not implemented)"
fi

# Claim: Worker jobs service is placeholder
check_pattern "apps/worker/src/modules/jobs/jobs.service.ts" "Phase 5" "Worker jobs service references Phase 5 (placeholder)"

echo ""

# ---------------------------------------------------------------------------
echo "--- Section C: Infrastructure / IaC Artifacts ---"
# ---------------------------------------------------------------------------

check_file "infra/compose/docker-compose.yml"
check_file "infra/caddy/Caddyfile"
check_file "apps/api/Dockerfile"
check_file "apps/worker/Dockerfile"
check_file ".dockerignore"

# Claim: 11 services in compose
compose_service_count="$(awk '/^services:/{in_svc=1;next} /^[a-z]/{in_svc=0} in_svc && /^  [a-z_]+:/{count++} END{print count}' "$COMPOSE_FILE")"
if [[ "$compose_service_count" -ge 10 && "$compose_service_count" -le 13 ]]; then
  pass "Compose service count: $compose_service_count (claimed 11)"
else
  fail "Compose service count: $compose_service_count (expected ~11)"
fi

# Claim: Pinned image tags (no :latest)
if grep -q 'image: .*:latest$' "$COMPOSE_FILE"; then
  fail ":latest image tag found in compose"
else
  pass "No :latest image tags in compose"
fi

# Claim: API container hardening
check_pattern "infra/compose/docker-compose.yml" "user: 'node'" "API non-root user in compose"
check_pattern "infra/compose/docker-compose.yml" "read_only: true" "Read-only filesystem in compose"
check_pattern "infra/compose/docker-compose.yml" "cap_drop:" "Capability drop in compose"
check_pattern "infra/compose/docker-compose.yml" "no-new-privileges:true" "No-new-privileges in compose"

# Claim: Caddy security headers
check_pattern "infra/caddy/Caddyfile" 'X-Content-Type-Options "nosniff"' "Caddy nosniff header"
check_pattern "infra/caddy/Caddyfile" 'X-Frame-Options "DENY"' "Caddy DENY framing header"
check_pattern "infra/caddy/Caddyfile" 'Referrer-Policy "no-referrer"' "Caddy no-referrer header"
check_pattern "infra/caddy/Caddyfile" "tls internal" "Caddy internal TLS"

# Claim: Frozen lockfile in Dockerfiles
check_pattern "apps/api/Dockerfile" "pnpm install --frozen-lockfile" "API Dockerfile frozen lockfile"
check_pattern "apps/worker/Dockerfile" "pnpm install --frozen-lockfile" "Worker Dockerfile frozen lockfile"

# Claim: Non-root USER in Dockerfiles
check_pattern "apps/api/Dockerfile" "USER node" "API Dockerfile non-root user"
check_pattern "apps/worker/Dockerfile" "USER node" "Worker Dockerfile non-root user"

# Claim: NODE_ENV=production in Dockerfiles
check_pattern "apps/api/Dockerfile" "NODE_ENV=production" "API Dockerfile production NODE_ENV"
check_pattern "apps/worker/Dockerfile" "NODE_ENV=production" "Worker Dockerfile production NODE_ENV"

echo ""

# ---------------------------------------------------------------------------
echo "--- Section C: Testing / Validation Artifacts ---"
# ---------------------------------------------------------------------------

# Claim: 9 shell test scripts
shell_test_count="$(find "$ROOT_DIR/infra/scripts/tests" -type f -name '*.sh' | wc -l | tr -d '[:space:]')"
if [[ "$shell_test_count" -eq 9 ]]; then
  pass "Shell test script count: $shell_test_count (claimed 9)"
else
  fail "Shell test script count: $shell_test_count (expected 9)"
fi

# Verify each test script exists
for test_script in \
  phase0-structure.sh \
  bootstrap-scripts.sh \
  phase1-compose.sh \
  secrets-hygiene.sh \
  env-loader-safety.sh \
  scope-accuracy.sh \
  hardening-baseline.sh \
  backup-restore-guards.sh \
  ops-reproducibility.sh; do
  check_file "infra/scripts/tests/$test_script"
done

# Claim: 3 Vitest test files
check_file "apps/api/test/health.e2e.test.ts"
check_file "apps/worker/test/health.e2e.test.ts"
check_file "packages/shared/test/file-lifecycle.test.ts"

# Claim: CI pipeline exists
check_file ".github/workflows/ci.yml"
check_pattern ".github/workflows/ci.yml" "pnpm lint" "CI runs lint"
check_pattern ".github/workflows/ci.yml" "pnpm typecheck" "CI runs typecheck"
check_pattern ".github/workflows/ci.yml" "pnpm test" "CI runs tests"
check_pattern ".github/workflows/ci.yml" "pnpm install --frozen-lockfile" "CI uses frozen lockfile"

echo ""

# ---------------------------------------------------------------------------
echo "--- Section C: Deployment / Operability Artifacts ---"
# ---------------------------------------------------------------------------

check_file "infra/scripts/bootstrap.sh"
check_file "infra/scripts/backup.sh"
check_file "infra/scripts/restore-smoke.sh"
check_file "infra/scripts/health.sh"
check_file "infra/scripts/demo-session.sh"
check_file "Makefile"
check_file "docs/runbooks/bootstrap.md"
check_file "docs/runbooks/backup-and-restore.md"
check_file "docs/runbooks/local-development.md"

# Claim: Backup script has SHA256 checksums
check_pattern "infra/scripts/backup.sh" "SHA256SUMS" "Backup script generates SHA256 checksums"
check_pattern "infra/scripts/backup.sh" "manifest.json" "Backup script generates manifest"
check_pattern "infra/scripts/backup.sh" "RETENTION_COUNT" "Backup script has retention rotation"
check_pattern "infra/scripts/backup.sh" "BACKUP_ROOT must not resolve to /" "Backup script has path safety guard"

# Claim: Restore smoke verifies checksums
check_pattern "infra/scripts/restore-smoke.sh" "shasum -a 256 -c SHA256SUMS" "Restore smoke verifies checksums"
check_pattern "infra/scripts/restore-smoke.sh" "backup is missing postgres.sql" "Restore smoke checks postgres.sql"
check_pattern "infra/scripts/restore-smoke.sh" "backup is missing manifest.json" "Restore smoke checks manifest.json"
check_pattern "infra/scripts/restore-smoke.sh" "backup is missing minio directory" "Restore smoke checks minio dir"

# Claim: Bootstrap has Argon2id guardrails
check_pattern "infra/scripts/bootstrap.sh" 'BOOTSTRAP_ADMIN_PASSWORD_HASH must begin with \$argon2id\$' "Bootstrap Argon2id format guard"
check_pattern "infra/scripts/bootstrap.sh" "SET_ARGON2ID_HASH_HERE" "Bootstrap placeholder rejection"

# Claim: Health script checks HTTP and HTTPS
check_pattern "infra/scripts/health.sh" "http://localhost" "Health script checks HTTP"
check_pattern "infra/scripts/health.sh" "https://localhost" "Health script checks HTTPS"

# Claim: Makefile has 18 targets
makefile_target_count="$(grep -cE '^[a-z][-a-z_]+:' "$ROOT_DIR/Makefile" || true)"
if [[ "$makefile_target_count" -ge 15 && "$makefile_target_count" -le 22 ]]; then
  pass "Makefile target count: $makefile_target_count (claimed 18)"
else
  fail "Makefile target count: $makefile_target_count (expected ~18)"
fi

echo ""

# ---------------------------------------------------------------------------
echo "--- Section C: Governance / Documentation Artifacts ---"
# ---------------------------------------------------------------------------

check_file "docs/adr/ADR-001-architecture-and-stack.md"
check_file "docs/adr/ADR-002-file-lifecycle.md"
check_file "docs/adr/ADR-003-encryption-and-key-management.md"
check_file "docs/threat-model.md"
check_file "docs/security-baseline.md"
check_file "docs/data-model.md"
check_file "IMPLEMENTATION_PLAN.md"
check_file "docs/status/phase-00.md"
check_file "docs/status/phase-01.md"
check_file "docs/status/hardening-pass.md"
check_file "docs/addons/ADDON-001-HARDENING-REPRODUCIBILITY-CHANGELOG.md"

echo ""

# ---------------------------------------------------------------------------
echo "--- Section C: Commercial / Legal Packaging Artifacts ---"
# ---------------------------------------------------------------------------

legal_doc_count="$(find "$ROOT_DIR/docs/legal" -type f -name '*.md' | wc -l | tr -d '[:space:]')"
if [[ "$legal_doc_count" -ge 11 && "$legal_doc_count" -le 15 ]]; then
  pass "Legal doc count: $legal_doc_count (claimed 13)"
else
  fail "Legal doc count: $legal_doc_count (expected ~13)"
fi

check_file "LICENSE"
check_file "docs/legal/DEMO_EVALUATION_TERMS.md"
check_file "docs/legal/COMMERCIAL_RIGHTS_OPTIONS.md"
check_file "docs/legal/PRICING_AND_EFFORT_ESTIMATE.md"
check_file "docs/legal/CLIENT_PRICING_TALK_TRACK.md"
check_file "docs/legal/FORK_LICENSE_TEMPLATE.md"
check_file "docs/legal/SESSION_PREP_PACKAGE.md"
check_file "docs/legal/CLIENT_MEETING_CHECKLIST.md"
check_file "docs/legal/SESSION_RUN_SCRIPT.md"
check_file "docs/legal/PRE_SESSION_EMAIL_TEMPLATE.md"
check_file "docs/legal/INITIAL_ENGAGEMENT_EMAIL_DRAFT.md"
check_file "docs/legal/RECORDING_AND_REFERENCE_CONSENT.md"
check_file "docs/legal/LEGAL_DECISIONS.md"

# Claim: License is proprietary (All Rights Reserved)
check_pattern "LICENSE" "All rights reserved" "License is proprietary"
check_pattern "LICENSE" "docs/client-source/" "License has client-materials carve-out"

echo ""

# ---------------------------------------------------------------------------
echo "--- Section D: Implemented Scope Claims ---"
# ---------------------------------------------------------------------------

# Claim: Prisma schema has 3 models
prisma_model_count="$(grep -c '^model ' "$ROOT_DIR/apps/api/prisma/schema.prisma" || true)"
if [[ "$prisma_model_count" -eq 3 ]]; then
  pass "Prisma model count: $prisma_model_count (claimed 3)"
else
  fail "Prisma model count: $prisma_model_count (expected 3)"
fi

# Claim: 2 Prisma migrations
migration_count="$(find "$ROOT_DIR/apps/api/prisma/migrations" -type d -mindepth 1 -maxdepth 1 | wc -l | tr -d '[:space:]')"
if [[ "$migration_count" -eq 2 ]]; then
  pass "Prisma migration count: $migration_count (claimed 2)"
else
  fail "Prisma migration count: $migration_count (expected 2)"
fi

# Claim: File lifecycle has 8 states
check_pattern "packages/shared/src/file-lifecycle.ts" "created" "Lifecycle state: created"
check_pattern "packages/shared/src/file-lifecycle.ts" "stored" "Lifecycle state: stored"
check_pattern "packages/shared/src/file-lifecycle.ts" "quarantined" "Lifecycle state: quarantined"
check_pattern "packages/shared/src/file-lifecycle.ts" "scan_pending" "Lifecycle state: scan_pending"
check_pattern "packages/shared/src/file-lifecycle.ts" "active" "Lifecycle state: active"
check_pattern "packages/shared/src/file-lifecycle.ts" "blocked" "Lifecycle state: blocked"
check_pattern "packages/shared/src/file-lifecycle.ts" "expired" "Lifecycle state: expired"
check_pattern "packages/shared/src/file-lifecycle.ts" "deleted" "Lifecycle state: deleted"

# Claim: Safe env parser exists
check_file "infra/scripts/lib/env.sh"
check_pattern "infra/scripts/lib/env.sh" "load_env_file" "Safe env parser function exists"

# Claim: Argon2id hash utility exists
check_file "apps/api/src/tools/hash-password.ts"
check_pattern "apps/api/src/tools/hash-password.ts" "argon2" "Hash utility uses Argon2"

echo ""

# ---------------------------------------------------------------------------
echo "--- Section E: System Coherence Claims ---"
# ---------------------------------------------------------------------------

# Claim: Scope-accuracy is enforced by automated test
check_file "infra/scripts/tests/scope-accuracy.sh"
check_pattern "infra/scripts/tests/scope-accuracy.sh" "Phase 0/1 scaffold" "Scope test enforces scaffold language in README"
check_pattern "infra/scripts/tests/scope-accuracy.sh" "Not implemented yet" "Scope test enforces not-implemented disclosure in README"

# Claim: README is honest about scope
check_pattern "README.md" "This repository currently implements a **Phase 0/1 scaffold**, not a complete secure file sharing prototype." "README scope truth statement"
check_pattern "README.md" "Not implemented yet:" "README lists unimplemented items"

# Claim: Security baseline distinguishes implemented vs planned
check_pattern "docs/security-baseline.md" "many controls are still scaffolded and not yet enforced" "Security baseline scope caveat"

# Claim: Threat model distinguishes implemented vs planned
check_pattern "docs/threat-model.md" "Current codebase is still scaffold-heavy (Phase 0/1)" "Threat model scope caveat"

# Claim: Data model distinguishes implemented vs planned
check_pattern "docs/data-model.md" "Current implemented schema is a scaffold subset" "Data model scope caveat"

echo ""

# ---------------------------------------------------------------------------
echo "--- Section I: Seller Pricing Document Claims ---"
# ---------------------------------------------------------------------------

# Claim: Seller claims 340-560 hours
check_pattern "docs/legal/PRICING_AND_EFFORT_ESTIMATE.md" "340 to 560 hours" "Seller effort claim: 340-560 hours"

# Claim: Seller Option 1 range is $75K-$120K
check_pattern "docs/legal/PRICING_AND_EFFORT_ESTIMATE.md" '$75,000 to $120,000' "Seller Option 1 range"

# Claim: Seller Option 2 upfront is $30K-$55K
check_pattern "docs/legal/PRICING_AND_EFFORT_ESTIMATE.md" '$30,000 to $55,000' "Seller Option 2 upfront range"

# Claim: Seller minimum for Option 1 is $90K
check_pattern "docs/legal/CLIENT_PRICING_TALK_TRACK.md" '$90,000' "Seller Option 1 minimum"

echo ""

# ---------------------------------------------------------------------------
echo "--- Dependency Hygiene Claims ---"
# ---------------------------------------------------------------------------

# Claim: pnpm-lock.yaml committed
check_file "pnpm-lock.yaml"

# Claim: .env.example has CHANGE_ME placeholders
check_pattern ".env.example" "CHANGE_ME" ".env.example has CHANGE_ME placeholders"

# Claim: .env is in .gitignore
check_pattern ".gitignore" ".env" ".env in .gitignore"

# Claim: .env is in .dockerignore
check_pattern ".dockerignore" ".env" ".env in .dockerignore"

echo ""

# ---------------------------------------------------------------------------
echo "--- Summary ---"
# ---------------------------------------------------------------------------

TOTAL=$((PASS + FAIL))
echo "========================================"
echo "Results: $PASS passed, $FAIL failed ($TOTAL total checks)"
echo "========================================"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "WARNING: Some valuation evidence claims could not be verified."
  echo "The valuation report should be re-examined for affected sections."
  exit 1
fi

echo ""
echo "All valuation evidence claims verified successfully."
