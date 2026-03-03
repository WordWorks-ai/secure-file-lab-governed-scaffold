# Live Session Run Script (60-75 Minutes)

Use this script verbatim or adapt lightly. It is designed to preserve IP leverage, validate fit, and produce a usable reference outcome.

## 0) Pre-Call Gate (Do Not Skip)

Required before recording:
- Signed `docs/legal/RECORDING_AND_REFERENCE_CONSENT.md`.
- Sent `docs/legal/DEMO_EVALUATION_TERMS.md`.
- If fork rights may be discussed, sent `docs/legal/FORK_LICENSE_TEMPLATE.md` as draft-only.

If signed recording consent is missing: run session unrecorded.

## 1) Opening Script (2-3 Minutes)

Read:

"Thanks for joining. Before we start, I want to confirm three things on record:
1. You consent to recording this session.
2. You understand this discussion is evaluation/advisory and does not transfer software ownership or license rights.
3. Any code usage or fork rights require a separate signed license.
4. Any commercial use or enterprise-core use of this IP requires a separate signed commercial rights agreement.
Is that all correct?"

If yes:

"Great. Today I want to do three things: understand your problem deeply, walk you through the implementation and security posture, and identify whether advisory, build support, or a licensed fork makes sense."

## 2) Discovery Script (15 Minutes)

Read:

"I want to start with your context before I show anything."

Ask in this order:
1. "What problem were you solving when you started this effort?"
2. "What have you tried already and where did it break down?"
3. "How did AI tools or coding agents help, and where did they fail you?"
4. "What security or governance requirements are non-negotiable for you?"
5. "If this went well, what outcome would matter most in the next 90 days?"

Close discovery:

"I’m hearing [summarize in 30 seconds]. I’ll now map the demo directly to those concerns."

## 3) Demo Script (20 Minutes)

### 3.1 Architecture

"This is a governed prototype scaffold, not an overbuilt enterprise mesh. Core services are Caddy, API, worker, Postgres, Redis, MinIO, Vault, ClamAV, MailHog, and backup."

### 3.2 Deterministic bootstrap and validation

"I’ll show deterministic startup, health checks, and test posture first, then code organization and hardening artifacts."

Suggested commands to run:

```bash
./infra/scripts/demo-session.sh
```

### 3.3 Code/governance walkthrough

"Now I’ll show how architecture decisions, threat model, and runbooks are encoded in-repo so implementation stays disciplined."

Open and walk:
- `IMPLEMENTATION_PLAN.md`
- `docs/adr/*`
- `docs/threat-model.md`
- `docs/security-baseline.md`
- `HARDENING_REVIEW.md`
- `SECURITY_FINDINGS.md`

## 4) Technical Q&A Script (10-15 Minutes)

"Ask anything you want in the codebase and I’ll answer directly with evidence and tradeoffs."

When challenged, use:

"That’s a fair critique. Current behavior is [fact]. The risk is [risk]. The controlled fix is [fix path]."

## 5) Commercial Positioning Script (5-10 Minutes)

Read:

"Here are the collaboration paths:
1. Advisory only: architecture/security guidance, no code license grant.
2. Advisory + implementation support: scoped build work under services agreement.
3. Optional internal-use fork license: one legal entity, pinned commit, with terms negotiated in writing.
4. Optional commercial expansion: separate commercial license or full assignment agreement, only if I explicitly approve in a signed definitive agreement.

I retain ownership by default. Any fork or broader commercial rights are explicit and signed, not implied."

## 6) Reference Close Script (2 Minutes)

Read:

"If this was useful, I’d like your permission to use this as a reference. We can do named reference, anonymous testimonial, or no external reference. What are you comfortable with?"

Capture exact answer in writing after the call.

## 7) Post-Call Script (Email Within 24 Hours)

Use `docs/legal/PRE_SESSION_EMAIL_TEMPLATE.md` follow-up section and include:
- Problem summary (their words)
- Risks/gaps identified
- Recommended next step option (1/2/3)
- Any required signature documents
