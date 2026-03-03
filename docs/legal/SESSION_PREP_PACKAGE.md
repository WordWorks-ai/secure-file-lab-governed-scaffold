# Session Prep Package (Reference + Advisory Demo)

## Goal

Run a structured demo/discovery call that:
- demonstrates your capability and working style
- captures actionable feedback from a senior security/red-team engineer
- preserves your IP leverage while exploring collaboration options

## Operating Principle

- Ownership remains with you by default.
- No code rights are granted without a signed license.
- Recording is done only with explicit consent and signed release.
- Commercial or enterprise-core use of the IP requires separate signed commercial rights.

## What To Send 24-48 Hours Before Session

1. Project context packet
- `README.md`
- `HARDENING_REVIEW.md`
- `SECURITY_FINDINGS.md`

2. Legal/commercial packet
- `LICENSE`
- `docs/legal/DEMO_EVALUATION_TERMS.md`
- `docs/legal/RECORDING_AND_REFERENCE_CONSENT.md`
- `docs/legal/COMMERCIAL_RIGHTS_OPTIONS.md`
- `docs/legal/FORK_LICENSE_TEMPLATE.md` (discussion draft only)
- `docs/legal/SESSION_RUN_SCRIPT.md`
- `docs/legal/PRE_SESSION_EMAIL_TEMPLATE.md`

3. Session logistics
- date/time + meeting link
- explicit notice if recording is requested
- request signed recording/release form before call if recording is planned

## Required Gating Checklist (Before Joining Call)

- [ ] `docs/legal/DEMO_EVALUATION_TERMS.md` sent
- [ ] `docs/legal/RECORDING_AND_REFERENCE_CONSENT.md` signed (if recording)
- [ ] session objective confirmed (advisory, implementation support, or license discussion)
- [ ] legal entity name captured if licensing could be discussed

## Default Session Agenda (60-75 min)

1. Problem framing by client (15 min)
- What problem were you solving?
- What did you try?
- What worked/failed?
- How did you use AI/Codex/other tools?
- Where did engineering/security confidence break down?

2. Demo walkthrough (20 min)
- architecture and scope boundaries
- clean bootstrap, health checks, test posture
- governance artifacts and hardening decisions

3. Codebase and implementation review (15 min)
- module layout and current capabilities
- known limitations and gaps
- why certain controls were implemented now vs deferred

4. Open Q&A (10-15 min)
- answer targeted code/security questions live
- show reasoning and tradeoff process

5. Commercial/reference next step (5-10 min)
- advisory-only option
- scoped implementation option
- one-off negotiated fork option

## Discovery Questions To Ask During Session

Product/problem:
- What is the operational pain today?
- What outcomes would make this successful in 90 days?

Engineering/security:
- Which controls are non-negotiable for you?
- Which risks are acceptable in prototype phase?

Tooling/workflow:
- How are you currently using AI coding tools?
- What quality/security failures have you seen from AI-assisted development?

Commercial:
- Do you want advisory only, build support, or license + services?
- Do you need internal-use rights only, or customer-facing deployment rights?

## Live Demo Checklist

- Confirm recording consent status on-record.
- Confirm non-confidential baseline unless otherwise agreed.
- Confirm software ownership and licensing boundary on-record.
- Run health/status checks.
- Show tests and current pass/fail reality.
- Show known limitations plainly.
- Capture client feedback and objections in real time.

## Decision Framework You Can Use At End

Option A: Advisory engagement
- architecture/security reviews, implementation guidance, no code license grant needed

Option B: Advisory + implementation support
- time-boxed workstream, services SOW, no transfer of ownership

Option C: One-off negotiated fork license
- internal use only, pinned commit, no redistribution/SaaS rights unless expanded in signed terms

Use `docs/legal/SESSION_RUN_SCRIPT.md` for exact phrasing and sequence.

## Follow-Up Email Template

Use `docs/legal/PRE_SESSION_EMAIL_TEMPLATE.md` follow-up section.

## Guardrails For Leverage Preservation

- Do not publish under permissive open-source license unless intentionally choosing to.
- Do not grant fork rights verbally; always require signed written terms.
- Keep services scope and code rights in separate documents.
- Keep reference/testimonial rights explicit and written.
- Do not rely on attendance-only assent for recording or IP rights.
- Treat commercialization and ownership-transfer rights as separate negotiated instruments.
