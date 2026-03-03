# Pricing and Effort Estimate (Client Discussion)

## Purpose

Provide a fair, defensible pricing and effort reference for the current repository state.

Scope basis for this estimate:
- current deliverable is a hardened **Phase 0/1 scaffold**
- secure file-sharing feature scope (auth/files/shares/audit runtime) is not complete
- value includes implementation code, infrastructure automation, and governance artifacts

This document is a commercial planning aid, not legal or tax advice.

## Baseline Note (2026-03-03)

For current live pitch numbers and meeting script, use:
- `docs/legal/COMMERCIAL_POSITION_BASELINE.md`
- `docs/legal/CLIENT_PRICING_TALK_TRACK.md`

This document remains useful for effort framing and option design, but it is not the primary source for current anchor/floor pricing.

## Current Asset Reality

What is implemented and demonstrable now:
- deterministic local platform bootstrap (`docker compose` + bootstrap scripts)
- hardened container/runtime defaults for API and worker
- infrastructure orchestration for Postgres, Redis, MinIO, Vault, ClamAV, Caddy, backup
- backup generation and restore smoke verification
- quality/test guardrails for scaffold, hardening, and scope accuracy
- governance package (ADRs, threat model, runbooks, status evidence)

What is not implemented yet:
- auth/session runtime flow
- file ingest/download pipeline with encryption workflow
- malware gate worker pipeline
- share-link runtime policy controls
- complete runtime audit event coverage

## Estimated Effort to Produce Current Package

Estimated total effort for the current artifact package:
- **340 to 560 hours**

Likely specialties required:
- backend/platform engineering (Node/NestJS/Prisma)
- DevOps/infrastructure engineering (Docker/Compose/runtime hardening)
- security engineering (threat model, hardening controls, failure behavior)
- QA/automation (shell guardrails, CI checks, reproducibility tests)
- technical documentation and governance writing
- legal/commercial packaging support

Likely team shape:
- **2 to 4 contributors** (often 1-2 core builders plus part-time specialists)

Likely real-time schedule:
- **6 to 10 weeks** at ~2 FTE
- or **10 to 16 weeks** mostly solo with specialist support

## Pricing Framework (Three Commercial Options)

### Option 1: Implemented Code Assignment (Snapshot Ownership)

Client receives ownership of implemented code snapshot at a pinned commit.

Typical structure:
- one-time fee: **$75,000 to $120,000**
- rights transfer limited to defined files/paths and commit hash
- governance methodology docs and internal process IP excluded unless explicitly listed
- no royalty obligation after transfer

Best for:
- client wants autonomy and no recurring commercial dependency

### Option 2: Hybrid License + Revenue Share + Collaborative Repo Access (Recommended)

Client gets broad operational rights to the implemented code while creator retains core IP and participates in ongoing evolution.

Typical structure:
- upfront license/onboarding fee: **$30,000 to $55,000**
- revenue share: **5% to 12%** of defined revenue from commercialization
- optional support retainer: **$2,500 to $8,000/month**
- contribution model: shared repo access, change-review gates, security governance
- optional buyout clause to convert to full assignment later

Best for:
- fair shared upside with lower entry cost and continued technical stewardship

### Option 3: Full Partnership / Joint Venture

Structure may include equity, governance rights, and shared execution responsibility.

Typical structure:
- low or moderate upfront cash
- larger revenue/equity sharing
- formal operating and decision rights

Best for:
- strategic long-horizon collaboration where both parties contribute materially beyond code

## Fairness Controls (Use in All Deals)

1. Scope truth clause
- agreement must state the asset is currently a Phase 0/1 scaffold

2. Pinned deliverable clause
- rights are tied to exact commit hash and explicit file schedules

3. Included/Excluded schedule
- define implemented code, client-provided materials, and excluded methodology docs

4. Future work separation
- future features/support handled by separate SOW or addendum

5. Commercial auditability
- for revenue-share structures, define revenue basis, reporting cadence, and audit rights

## Suggested Default Negotiation Path

Start with Option 2 and provide a clean conversion path:
- if trust and traction increase, client can exercise predefined buyout to Option 1
- if collaboration broadens strategically, both parties may move to Option 3
