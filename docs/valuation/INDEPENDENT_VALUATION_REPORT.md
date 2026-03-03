# Independent Software Repository Valuation Report

**Repository:** Schwass — Self-Hosted Secure File Lab (Governed Scaffold)
**Assessment Date:** 2026-03-03
**Analyst:** Independent software commercialization analysis (no affiliation with either party)
**Method:** Artifact-evidence-only valuation (no timeline/history/founder-narrative inputs)

---

## A. Executive Summary

1. The repository delivers a **Phase 0/1 governed infrastructure scaffold**, not a feature-complete secure file-sharing product. The README and all governance documents explicitly state this.
2. **Implemented and demonstrable now:** Docker Compose topology (11 services, including 1 bootstrap-profile service), deterministic bootstrap automation, container runtime hardening (non-root, read-only, cap-drop), Caddy TLS/security headers, PostgreSQL backup with SHA256 checksums, MinIO object backup, restore smoke verification (Postgres + MinIO), 9 shell-based test suites enforcing hardening/structure/hygiene invariants, CI pipeline, Prisma schema (3 tables), NestJS API + Worker health endpoints, shared file-lifecycle state machine library, and a comprehensive governance/legal/commercial document package.
3. **Not implemented:** Authentication/session lifecycle, file ingest/download/encryption pipeline, malware scan queue/worker, share-link policy runtime, runtime audit event emission. These represent the **core product functionality** (Phases 2-6 of 8).
4. The repository shows **unusually high engineering discipline** for its scope: explicit scope-truth enforcement via automated tests, safe env parsing, idempotent bootstrap, backup integrity checksums, and a hardening review that honestly marks its own gaps.
5. The seller's existing pricing documents claim 340-560 hours of effort and price Option 1 at $75K-$120K. This analysis finds that range **overstates** the value of the delivered artifacts when evaluated strictly on reproducible complexity, but acknowledges the governance/discipline premium is real.
6. The commercial/legal document package (13 documents) is professional and adds meaningful buyer risk-reduction value, though it is template-grade and requires legal counsel for execution.
7. **Overstatement risk is low.** The repository is notably self-honest: automated tests enforce scope-accuracy claims in documentation, and the HARDENING_REVIEW and SECURITY_FINDINGS explicitly mark core capability as unimplemented.
8. The primary buyer value proposition is: **accelerated infrastructure foundation with proven hardening discipline, saving 6-12 weeks of platform engineering ramp-up for a competent team.**
9. Fair commercial floor for snapshot ownership (Option 1) is **$18,000-$32,000**. Fair hybrid license entry (Option 2) is **$12,000-$20,000 upfront**.
10. Confidence level: **Medium-High** — evidence is strong for what exists; the gap between scaffold and product is clearly defined.

---

## B. Evidence Table

| Category | Key Files | Score (0-5) | Rationale |
|---|---|---|---|
| **Application Code** | `apps/api/src/**` (6 files), `apps/worker/src/**` (5 files), `packages/shared/src/**` (2 files) | **2.0** | Minimal functional code: health endpoints with dependency TCP checks, system info endpoint, placeholder worker job service, and a clean file-lifecycle state machine helper. No auth, file, share, or audit modules. Well-structured NestJS/Fastify patterns for what exists. |
| **Infrastructure / IaC** | `infra/compose/docker-compose.yml`, `infra/caddy/Caddyfile`, `apps/api/Dockerfile`, `apps/worker/Dockerfile`, `.dockerignore` | **3.5** | 11-service Compose topology with health checks, dependency ordering, named volumes, pinned image tags, platform pinning. API/worker containers hardened: non-root, read-only, cap-drop ALL, no-new-privileges. Caddy with TLS internal + security headers. Dockerfiles use frozen lockfile, non-root user, production NODE_ENV. |
| **Security Hardening** | `HARDENING_REVIEW.md`, `SECURITY_FINDINGS.md`, compose hardening, Caddyfile headers, bootstrap guardrails | **3.5** | Container runtime hardening is strong and verified by tests. Bootstrap admin seed enforces Argon2id format + placeholder rejection + email validation + safe SQL interpolation. Backup retention has path safety guards. Caddy security headers baseline. Honest self-assessment of gaps. |
| **Testing / Validation** | 9 shell test scripts, 3 Vitest test files, CI pipeline | **3.0** | Shell tests enforce: file structure, compose presence, secrets hygiene, env-loader safety, scope-accuracy (docs match reality), hardening baseline (compose + Caddyfile + Dockerfile + bootstrap controls), backup-restore guards (negative tests), ops reproducibility (destructive full-cycle). Vitest: health e2e for API/worker + file-lifecycle unit tests. CI runs all scaffold tests + lint + typecheck + unit tests + compose validate. Good for scaffold scope; no domain feature tests because features don't exist. |
| **Deployment / Operability** | `bootstrap.sh`, `backup.sh`, `restore-smoke.sh`, `health.sh`, `demo-session.sh`, `Makefile`, runbooks | **3.5** | Idempotent bootstrap with configurable wait timeouts. Backup generates pg_dump + MinIO mirror + SHA256 checksums + JSON manifest with retention rotation. Restore smoke verifies into ephemeral containers with checksum validation. Health script verifies HTTP + HTTPS through Caddy. Demo session script runs full validation pipeline. Makefile with clear targets. 3 operational runbooks. |
| **Governance / Documentation** | 3 ADRs, threat model, security baseline, data model, implementation plan, 3 status docs, addon changelog | **3.5** | ADRs are well-structured (context/decision/rationale/consequences/alternatives). Threat model identifies 8 primary threats, abuse cases, security invariants. All governance docs honestly distinguish implemented vs planned. Scope-accuracy is enforced by automated test (`scope-accuracy.sh`). Phase status docs include detailed evidence. |
| **Commercial / Legal Packaging** | 13 docs under `docs/legal/`, `LICENSE` | **3.0** | Professional templates: demo evaluation terms, commercial rights options (3 structures), pricing/effort estimate, client pricing talk track with meeting script, fork license template, session prep package, meeting checklist, pre-session email template, recording consent. All proprietary license with explicit carve-out for client-provided materials. Template-grade; requires legal counsel. |

---

## C. Implemented vs Deferred Scope Table

| Capability | Status | Evidence |
|---|---|---|
| Monorepo structure + tooling | **Implemented** | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.eslintrc.cjs`, `.prettierrc.json` |
| Docker Compose topology (11 services, including 1 bootstrap-profile service) | **Implemented** | `infra/compose/docker-compose.yml` — 275 lines, all services with healthchecks |
| Container runtime hardening | **Implemented** | Non-root, read-only, cap-drop ALL, no-new-privileges, tmpfs for API + Worker |
| Caddy TLS + security headers | **Implemented** | `infra/caddy/Caddyfile` — local HTTPS, nosniff, DENY, no-referrer, permissions-policy |
| Deterministic bootstrap (Postgres, MinIO, Vault, admin seed) | **Implemented** | `bootstrap.sh` + sub-scripts, idempotent, with Argon2id guardrails |
| Backup with integrity (pg_dump + MinIO mirror + SHA256) | **Implemented** | `backup.sh` — checksums, manifest, retention rotation, path safety guards |
| Restore smoke (Postgres + MinIO into ephemeral containers) | **Implemented** | `restore-smoke.sh` — 167 lines, full artifact validation + checksum verification |
| Health check system (HTTP + HTTPS through Caddy) | **Implemented** | `health.sh`, `dependency-health.service.ts` (TCP probe all 5 deps) |
| API/Worker health endpoints | **Implemented** | `health.controller.ts` (live + ready), e2e tests |
| Prisma schema (users, bootstrap_state, audit_events) | **Implemented** | `schema.prisma` — 3 models, 2 migrations |
| File lifecycle state machine (library) | **Implemented** | `file-lifecycle.ts` — 8 states, transition rules, download gate; unit tested |
| Shell-based quality gate tests (9 suites) | **Implemented** | `infra/scripts/tests/*.sh` — structure, compose, secrets, env-safety, hardening, scope-accuracy, backup-restore guards |
| CI pipeline | **Implemented** | `.github/workflows/ci.yml` — scaffold tests + lint + typecheck + unit tests + compose validate |
| Governance docs (ADRs, threat model, security baseline) | **Implemented** | 3 ADRs, threat model, security baseline, data model — all with implemented/planned distinction |
| Safe env parser | **Implemented** | `infra/scripts/lib/env.sh` — non-executing KEY=VALUE parser |
| Argon2id hash utility | **Implemented** | `apps/api/src/tools/hash-password.ts` |
| **Auth/session lifecycle** | **Not implemented** | No auth module, no JWT, no refresh tokens, no RBAC enforcement |
| **File ingest/download/encryption pipeline** | **Not implemented** | No file module, no MinIO integration in API, no Vault wrap/unwrap |
| **Malware scan queue/worker** | **Not implemented** | `jobs.service.ts` is a placeholder logging "Phase 5" |
| **Share-link policy runtime** | **Not implemented** | No share module, no share entity |
| **Runtime audit event emission** | **Not implemented** | Schema exists but no event capture code |
| **Data model (full)** | **Scaffolded only** | `data-model.md` defines 8 entities; only 3 exist in Prisma schema |

---

## D. Engineering Discipline Table

| Dimension | Score (0-5) | Evidence |
|---|---|---|
| **Architectural coherence** | 3.5 | Clear monorepo layout (apps/api, apps/worker, packages/shared). NestJS modular monolith with Fastify adapter. Clean module/controller/service separation. Consistent naming. ADRs justify decisions with alternatives considered. |
| **Modularity / separation of concerns** | 3.0 | Health, system, and jobs modules properly isolated. Shared package for cross-cutting lifecycle logic. Worker has clear async boundary. However, feature modules don't exist yet so the pattern is unproven at scale. |
| **Dependency hygiene** | 4.0 | Frozen lockfile enforced in Dockerfiles + CI (verified by automated test). Pinned image tags for all 8 compose service images (verified by automated test). No `:latest` tags allowed (verified). Platform pinning for amd64-only images. `pnpm-lock.yaml` committed. |
| **Security posture** | 3.5 | Strong container hardening. Argon2id enforcement with placeholder rejection. Safe SQL interpolation with `psql -v`. Backup path safety guards. Secrets hygiene scan. `.dockerignore` excludes `.env`. Caddy security headers. Honest security findings document. |
| **Secret handling** | 3.5 | `.env.example` has only placeholders with `CHANGE_ME` prefixes. `.env` in `.gitignore` and `.dockerignore`. Secrets hygiene test scans for accidentally committed keys. Safe env parser avoids shell execution of `.env` content. |
| **Reproducibility** | 4.0 | `ops-reproducibility.sh` performs destructive full-cycle test: down -v, clean bootstrap, re-bootstrap (idempotency), partial restart, full restart without volume reset. Frozen lockfile. Pinned images. Deterministic bootstrap with explicit wait windows. |
| **Test coverage depth** | 3.0 | 9 shell test suites covering structural, hardening, and negative-case scenarios. 3 Vitest files covering health endpoints and lifecycle logic. No domain feature tests (because no features). Tests verify their own scope-accuracy claims — unusual and valuable discipline. |
| **CI/CD quality gates** | 2.5 | Single CI job with scaffold tests, lint, typecheck, unit tests, compose validation. No multi-stage pipeline, no integration tests with Docker services, no container build verification in CI. Adequate for scaffold phase. |
| **Operational readiness** | 3.5 | Makefile with 18 targets. 3 runbooks (bootstrap, backup-restore, local-dev). Demo session script. Backup with retention. Restore smoke with ephemeral containers. Health checks through the full stack. |
| **Documentation fidelity** | 4.0 | Exceptional: automated test (`scope-accuracy.sh`) enforces that README, security-baseline, threat-model, and data-model all contain explicit "not implemented" / "scaffold" disclaimers. Documentation does not overstate capability. |
| **Transfer readiness** | 3.0 | Clean clone-to-running path documented. `.env.example` comprehensive. Makefile provides standard entry points. However, no CONTRIBUTING guide, no architecture diagram, no module-level API docs. A competent team could onboard in 1-3 days. |

---

## E. Replacement Effort Table

Estimates represent the effort for a competent team to reproduce the **observable delivered artifact set** at comparable quality from a blank slate. These are not estimates of historical elapsed time.

| Role | Low (hrs) | Likely (hrs) | High (hrs) |
|---|---|---|---|
| **Backend/Platform Engineering** (NestJS/Prisma setup, health endpoints, shared lifecycle library, app scaffolding) | 16 | 24 | 36 |
| **DevOps/Platform Engineering** (Compose topology, Dockerfiles, bootstrap scripts, backup/restore, health checks, reproducibility automation) | 40 | 60 | 85 |
| **Security Engineering** (Container hardening, Caddy config, bootstrap guardrails, safe env parser, Argon2id integration, threat model, security baseline, findings review) | 24 | 36 | 50 |
| **QA/Test Engineering** (9 shell test suites, e2e health tests, lifecycle unit tests, backup-restore negative tests, CI pipeline) | 20 | 30 | 45 |
| **Technical Writing / Governance** (3 ADRs, threat model, security baseline, data model, 3 runbooks, implementation plan, 3 status docs, addon changelog) | 16 | 24 | 36 |
| **Legal/Commercial Packaging** (13 legal/commercial docs, license, pricing structure, meeting scripts, templates) | 12 | 18 | 28 |
| **Architecture/Integration** (Design decisions, stack selection, service topology design, lifecycle state machine design) | 8 | 12 | 18 |
| **TOTAL** | **136** | **204** | **298** |

**Role-mix assumptions:**
- 2-3 contributors typical: 1 senior backend/DevOps lead, 1 security-aware engineer, 0.5 technical writer
- Senior engineers at this quality level: $125-$200/hr blended market rate
- Legal/commercial packaging: typically involves $250-$400/hr counsel review even for templates

---

## F. Pricing Matrix

### Cost Basis

| Scenario | Hours | Rate | Raw Value | Quality Adj (+15% for discipline) | Risk Adj (-20% for scope gaps + transfer risk) | Net |
|---|---|---|---|---|---|---|
| **Conservative** | 136 | $125/hr | $17,000 | $19,550 | **$15,640** | |
| **Market-Standard** | 204 | $165/hr | $33,660 | $38,709 | **$30,967** | |
| **Upper (high hours, high rate)** | 298 | $200/hr | $59,600 | $68,540 | **$54,832** | |

### Adjustments Applied

| Adjustment | Direction | Magnitude | Rationale |
|---|---|---|---|
| Engineering discipline premium | +15% | Applied above | Automated scope-truth enforcement, idempotent bootstrap, safe env parser, backup integrity checksums, container hardening with test enforcement — above typical scaffold quality |
| Core feature absence discount | -10% | Part of -20% | Auth, files, shares, audit, worker pipeline are all unimplemented; these represent the product's raison d'etre |
| Transfer/integration risk discount | -5% | Part of -20% | No integration tests with running services in CI; onboarding documentation is adequate but not comprehensive |
| Scope-honesty credit | +0% | Neutral | Self-honesty reduces buyer risk but is already reflected in accurate scope assessment (no hidden surprises) |
| Legal template value | Included | ~$3,000-$5,000 | Templates require attorney review; value is in structure and thought, not in legal enforceability |

---

### Option 1: Snapshot Ownership Transfer

| | Value |
|---|---|
| **Fair minimum** | **$18,000** |
| **Fair target** | **$25,000** |
| **Upper bound (if all conditions met)** | **$38,000** |

**What buyer receives:** Full ownership of all implemented code, infrastructure scripts, tests, governance docs, and commercial templates at pinned commit. No ongoing obligations. Buyer runs roadmap independently.

**Buyer pros:** Complete autonomy. No revenue share. No ongoing commercial dependency. Clean starting point for feature development.

**Buyer cons:** Must build all core features (auth, files, shares, encryption, scan, audit) independently. No ongoing creator support unless separately contracted. Governance methodology expertise does not transfer with code.

**Seller pros:** Clean exit. Full payment upfront. No ongoing obligations.

**Seller cons:** No upside participation. Fair value for scaffold is modest relative to full-product ambition. Loses governance influence.

**Conditions required for upper bound:** Buyer has verified local bootstrap works from clean clone. Buyer has specific, funded feature roadmap. Buyer's team is competent to continue. Legal docs have been reviewed by counsel and are usable as-is.

**Inappropriate when:** Buyer expects a working secure file-sharing product. Buyer cannot independently build Phases 2-6. Buyer has no engineering team.

---

### Option 2: Hybrid License + Revenue Share + Optional Support

| | Value |
|---|---|
| **Upfront fair minimum** | **$12,000** |
| **Upfront fair target** | **$18,000** |
| **Revenue share range** | **3-8%** of defined commercialization revenue |
| **Support retainer (if requested)** | **$2,000-$5,000/month** |
| **Optional buyout to Option 1** | At predefined price within 12-24 months |

**What buyer receives:** Commercial license to implemented code. Collaborative repo access with change-review gates. Creator retains IP ownership but buyer has operational rights.

**Buyer pros:** Lower entry cost. Ongoing creator expertise available. Quality governance maintained. Conversion path to full ownership.

**Buyer cons:** Revenue share obligation. Dependency on creator for governance/quality gates. Less autonomy.

**Seller pros:** Retained IP position. Ongoing revenue participation. Continued influence on quality and direction.

**Seller cons:** Lower upfront cash. Revenue share may never materialize if buyer doesn't commercialize. Ongoing obligations.

**Conditions for upper upfront:** Creator commits to defined support hours. Security review gates are maintained. Buyer has active commercialization plan.

**Inappropriate when:** Buyer wants zero ongoing relationship. Buyer has no revenue model. Creator cannot commit to ongoing participation.

---

### Option 3: Full Partnership / Joint Venture

| | Assessment |
|---|---|
| **Viability** | Low for current state |
| **Trigger conditions** | Both parties contributing materially to feature build + go-to-market. Buyer brings distribution/capital, seller brings engineering + governance. |

**Current assessment:** The delivered artifact set is too early-stage to support a JV structure. There is no revenue, no product, and no market validation. JV structures carry high coordination overhead that is not justified by a scaffold-stage repository.

**Would become appropriate when:** Core features (auth, files, shares) are implemented and tested. At least one external deployment or pilot exists. Both parties have complementary and non-substitutable contributions.

---

## G. Negotiation Guardrails

### Hard Minimums

- **Option 1:** $18,000. Below this, the seller is undervaluing the infrastructure and governance work that demonstrably exists.
- **Option 2:** $12,000 upfront + 3% revenue share minimum. Below this, the economics do not justify the seller's retained obligations.
- **Walk-away floor:** $12,000 total guaranteed value. Below this, the deal is exploitative of the seller's delivered work.

### Non-Negotiable Contract Terms

1. **Scope truth clause:** Agreement must state the asset is a Phase 0/1 scaffold, not a complete product.
2. **Commit-bound delivery:** Rights tied to specific commit hash with explicit included/excluded file schedules.
3. **Client-provided materials carve-out:** Files under `docs/client-source/` remain client-owned.
4. **Future work separation:** No implied obligation to deliver Phases 2-8 under the asset transfer agreement.
5. **No warranty of product completeness:** "As-is" for implemented scope; no warranty that scaffold constitutes a working product.

### Acceptable Concessions

- Lower upfront in exchange for support retainer commitment (minimum 6 months).
- Staged payment (50% on signing, 50% on verified clean-clone bootstrap).
- Reduced revenue share in exchange for higher upfront.
- Transition support window (2-4 weeks of reasonable availability) included in target pricing.

### Evidence Thresholds for Higher Pricing

| Evidence | Price Unlock |
|---|---|
| Verified clean-clone bootstrap on buyer's infrastructure | Justifies target pricing |
| Buyer independently validates all scaffold tests pass | Justifies +10% |
| Legal docs reviewed and accepted by buyer's counsel without major revision | Justifies +$3,000-$5,000 for legal packaging value |
| Creator demonstrates live backup + restore cycle to buyer | Justifies target pricing |

---

## H. Final Recommendation

**Recommended structure:** Option 2 — Hybrid License with the following specific terms:

- **$15,000 upfront license fee**
- **5% revenue share** on net commercialization revenue, reported quarterly, with annual audit rights
- **$3,000/month support retainer** (optional; minimum 6-month commitment if activated)
- **Buyout conversion option** to full ownership at $25,000 additional, exercisable within 18 months
- **Transition support:** 2 weeks of reasonable availability included in upfront fee

**Rationale:** The repository delivers genuine infrastructure value with above-average engineering discipline, but it is firmly a scaffold and not a product. Option 2 fairly compensates the seller for delivered work while acknowledging that the asset's commercial value is heavily contingent on future feature implementation. The lower upfront reflects the reality that approximately 70% of the product's functional scope is unimplemented. The revenue share and buyout path give the seller fair participation in the upside that their foundation enables. The support retainer is justified only if the buyer actively builds on the scaffold and benefits from the creator's governance expertise.

**Confidence Rating: Medium-High**

- **Upward factors:** Every major claim in the repository is substantiated by artifacts. Self-honesty is enforced by automated tests. Container hardening, backup integrity, and bootstrap determinism are verified and non-trivial.
- **Downward factors:** Core product capability (auth, files, encryption, sharing, scanning) is entirely absent. The buyer is purchasing a starting point, not a product. The legal documents are templates requiring professional review. No evidence of external deployment or third-party verification.

---

## I. Comparison to Seller's Existing Pricing Documents

The seller's `PRICING_AND_EFFORT_ESTIMATE.md` claims 340-560 hours and prices Option 1 at $75,000-$120,000 with a minimum of $90,000.

| Dimension | Seller Claim | This Analysis | Gap Factor |
|---|---|---|---|
| Hours | 340-560 | 136-298 | Seller 1.9-2.5x higher |
| Option 1 range | $75K-$120K | $18K-$38K | Seller 3.2-4.2x higher |
| Option 1 minimum | $90K | $18K | Seller 5x higher |
| Option 2 upfront | $30K-$55K | $12K-$20K | Seller 2.5x higher |
| Revenue share | 5-12% | 3-8% | Seller range higher |

The seller's pricing appears to include significant **founder effort premium**, **aspiration premium**, and/or **full-product-vision pricing applied to scaffold-stage delivery**. This analysis values only what is demonstrably delivered and reproducible.

---

## J. Methodology Notes

### What This Analysis Values

- Observable artifact complexity, cohesion, and completeness
- Engineering discipline evidenced by automated enforcement
- Reusability and transferability of the delivered package
- Risk reduction already achieved for a buyer
- Replacement effort inferred from delivered artifacts only

### What This Analysis Excludes

- Git history, commit timestamps, branch chronology, or elapsed-time reasoning
- Founder narrative, intent, pitch language, or future possibility
- Presumed difficulty or learning curve
- Market demand or competitive positioning
- Speculative product-market fit

### Evidence Validation

Run `bash docs/valuation/verify-valuation-claims.sh` from the repository root to programmatically verify the factual claims made in this report. The script checks file existence, artifact counts, pattern presence, and structural assertions.

---

**Based on current delivered artifacts only (excluding timeline/history effects), the fair commercial floor is: $18,000 (Option 1) / $12,000 upfront (Option 2), with recommended structure: Option 2 at $15,000 upfront + 5% revenue share + optional $3,000/month support retainer.**
