# Legal And Commercial Decisions (Default Policy)

## Purpose

Define the default legal/commercial posture for discovery, demo, licensing, and implementation support.

This is an operational template, not legal advice.

## Baseline Position

1. Ownership default
- repository IP is proprietary and retained by Licensor unless a signed agreement states otherwise
- default license posture is `All Rights Reserved`
- client-provided materials under `docs/client-source/` remain 100% client-owned

2. Scope truth default
- delivered artifact is currently a hardened Phase 0/1 scaffold
- agreements must not imply feature-complete secure-file-sharing functionality

3. Services default
- advisory, implementation, and support are sold through separate written services agreements
- services fees do not imply IP transfer

4. Recording and reference default
- recording only with explicit signed consent plus on-call verbal confirmation
- testimonial/reference rights require explicit written permission

## Commercial Options Standard

Use the three-option framework in `docs/legal/COMMERCIAL_RIGHTS_OPTIONS.md`:

1. Option 1: Implemented code assignment (snapshot ownership)
2. Option 2: Hybrid license + revenue share + collaborative repo access (recommended default)
3. Option 3: Full partnership/JV (case-by-case)

Use pricing and effort baseline from:
- `docs/legal/PRICING_AND_EFFORT_ESTIMATE.md`

## Operational Rule Set

Before session:
1. Send:
- `README.md`
- `HARDENING_REVIEW.md`
- `SECURITY_FINDINGS.md`
- `docs/legal/DEMO_EVALUATION_TERMS.md`
- `docs/legal/COMMERCIAL_RIGHTS_OPTIONS.md`
- `docs/legal/PRICING_AND_EFFORT_ESTIMATE.md`
- `docs/legal/FORK_LICENSE_TEMPLATE.md` (draft if rights discussion is expected)
2. If recording is planned, require signed `docs/legal/RECORDING_AND_REFERENCE_CONSENT.md`.

During session:
1. Confirm recording consent status on record.
2. Confirm ownership boundary: no rights transfer without signed agreement.
3. Confirm scope truth: current asset is Phase 0/1 scaffold.
4. Select commercial path (Option 1/2/3) and capture open points.

After session:
1. Send recap with chosen option and unresolved terms.
2. If Option 1 selected, issue assignment terms with commit hash and asset schedule.
3. If Option 2 selected, issue hybrid license terms with revenue-share and governance clauses.
4. If Option 3 selected, issue partnership term sheet.

## Required Contract Schedules

Every signed deal must include:
1. Pinned commit hash / delivery snapshot
2. Included assets schedule
3. Excluded assets schedule
4. Support/maintenance scope (if any)
5. Payment model and milestones
6. If revenue share applies: revenue definition, reporting, audit, payment dates
