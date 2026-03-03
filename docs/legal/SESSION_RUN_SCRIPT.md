# Live Session Run Script (60-75 Minutes)

Use this script to keep the discussion clear, fair, and enforceable.

## 0) Pre-Call Gate

Required before recording:
- signed `docs/legal/RECORDING_AND_REFERENCE_CONSENT.md`

Required before commercial discussion:
- sent `docs/legal/DEMO_EVALUATION_TERMS.md`
- sent `docs/legal/COMMERCIAL_RIGHTS_OPTIONS.md`
- sent `docs/legal/PRICING_AND_EFFORT_ESTIMATE.md`

## 1) Opening Script (2-3 Minutes)

Read:

"Before we start, I want to confirm four points:
1. This package is currently a hardened Phase 0/1 scaffold.
2. It is not yet a feature-complete secure file-sharing runtime.
3. No ownership or license rights transfer without signed written terms.
4. If we proceed commercially, we will choose Option 1, 2, or 3 and bind rights to a commit hash and asset schedule.
Is that correct?"

## 2) Discovery Script (15 Minutes)

Ask:
1. "What business outcome do you need in the next 90 days?"
2. "Do you prefer full ownership now or lower-upfront shared-upside structure?"
3. "How much ongoing governance/support do you want from us?"
4. "What are your non-negotiable security controls before launch?"

## 3) Technical Walkthrough Script (20 Minutes)

Say:

"I’ll show what is implemented, what is hardened, and what remains roadmap scope."

Suggested command:

```bash
./infra/scripts/demo-session.sh
```

Open and walk:
- `README.md`
- `HARDENING_REVIEW.md`
- `SECURITY_FINDINGS.md`
- `docs/status/hardening-pass.md`

## 4) Commercial Script (15 Minutes)

Read:

"We can proceed in one of three ways:
1. Option 1: snapshot assignment of implemented code (higher upfront, full ownership of listed assets).
2. Option 2: hybrid license + revenue share + collaboration governance (recommended default).
3. Option 3: partnership/JV structure if both sides want deeper strategic alignment.

For fairness, we anchor scope to the current implemented package and leave future phases as separate roadmap work."

## 5) Objection Handling Script (10 Minutes)

"That concern is valid. Current behavior is [fact]. The remaining risk is [risk].
We can address it with [specific term, scope clause, or roadmap slice]."

## 6) Close Script (2-3 Minutes)

"Based on today, my recommended next step is [Option 1/2/3].
I’ll send terms with commit-bound asset schedules and pricing within 24 hours."

## 7) Post-Call Deliverables

Send:
- written recap
- selected option summary
- draft terms using `docs/legal/FORK_LICENSE_TEMPLATE.md`
- if Option 2: explicit revenue-share reporting and audit terms
