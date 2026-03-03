# Client Pricing Talk Track (Data-Driven, No Emotion)

## Purpose

Use this document as a factual script during client pricing/rights discussion.

## 1) Ground Truth (State First)

Current repository scope:
- hardened **Phase 0/1 scaffold**
- not feature-complete secure file-sharing runtime

Implemented value:
- deterministic compose/bootstrap automation
- runtime hardening controls
- backup + restore smoke validation
- quality/security guard tests
- governance/legal/runbook package

Source evidence:
- `README.md`
- `HARDENING_REVIEW.md`
- `SECURITY_FINDINGS.md`
- `docs/status/hardening-pass.md`

## 2) Effort Baseline (Use As Cost Anchor)

Estimated effort represented by current package:
- **340 to 560 hours**
- likely team shape: **2 to 4 contributors**

Source:
- `docs/legal/PRICING_AND_EFFORT_ESTIMATE.md`

## 3) Pricing Math (Use These Formulas Live)

Formulas:
- `Guaranteed Value = Upfront + (Monthly Retainer x Committed Months)`
- `Upside Value = Revenue Share % x Revenue Base`
- `All-In Value = Guaranteed Value + Upside Value`
- `Guaranteed Hourly Realization = Guaranteed Value / Hours`

Hours range for realization math:
- low hour case: `340`
- high hour case: `560`

## 4) Decision Options (Client-Facing)

### Option 1 - Snapshot Ownership Transfer

Commercial shape:
- one-time assignment fee
- ownership of listed implemented snapshot assets only
- excluded assets remain excluded unless listed

Target range:
- `$75,000 to $120,000`

Minimum acceptable:
- **$90,000 one-time**

Guaranteed hourly realization at minimum:
- `$90,000 / 560 = $161/hr`
- `$90,000 / 340 = $265/hr`

### Option 2 - Hybrid License + Revenue Share (Recommended)

Commercial shape:
- upfront fee
- revenue share
- optional support/monitoring retainer
- shared governance for contribution/security quality

Target range:
- upfront: `$30,000 to $55,000`
- revenue share: `5% to 12%`
- retainer: `$2,500 to $8,000/month`

Minimum acceptable:
- **$40,000 upfront + 8% revenue share**
- if ongoing monitoring/support requested: **$3,000/month minimum**

Guaranteed hourly realization at minimum upfront only:
- `$40,000 / 560 = $71/hr`
- `$40,000 / 340 = $118/hr`

Guaranteed hourly realization with 12-month minimum support:
- `($40,000 + ($3,000 x 12)) / 560 = $136/hr`
- `($40,000 + ($3,000 x 12)) / 340 = $224/hr`

### Option 3 - Partnership/JV

Commercial shape:
- custom governance/equity/revenue design
- use only if strategic long-horizon alignment is real

Default posture:
- do not force for this deal unless both sides explicitly want deep partnership

## 5) Hard Acceptance Gates (Binary)

Proceed only if all are true:
1. Scope truth is acknowledged in writing (Phase 0/1 scaffold reality).
2. Rights are bound to commit hash + included/excluded asset schedule.
3. Payment terms are explicit and enforceable.
4. Minimum economics are met:
- Option 1: at least `$90,000`.
- Option 2: at least `$40,000 + 8%` (and `$3,000/month` if monitoring/support is expected).
5. Commercial reporting and audit rights are defined for revenue share.

## 6) Walk-Away Rule

If guaranteed value is below **$60,000 equivalent**, decline.

## 7) Meeting Script (Read Verbatim)

"I want to keep this factual and simple.

The current package is a hardened Phase 0/1 scaffold with validated infrastructure, hardening, and governance controls. It is not yet a full feature-complete secure file-sharing runtime.

The build represented here is estimated at 340 to 560 hours across multiple specialties. We can structure this three ways:

Option 1: ownership transfer of the implemented snapshot, minimum 90,000.
Option 2: hybrid license with shared upside, minimum 40,000 upfront plus 8 percent revenue share, with 3,000 per month if ongoing monitoring/support is requested.
Option 3: partnership model only if we both want long-horizon joint execution.

I am happy to choose the structure that is best for your business, but I need the agreement tied to a commit-bound asset schedule and minimum economics that are fair to both sides."

## 8) Quick Objection Responses (Neutral)

If client says "too expensive":
- "Understood. We can switch structure rather than discount scope truth. Option 2 lowers upfront and aligns upside."

If client says "we want full ownership but lower price":
- "We can discuss staged buyout terms, but full transfer requires Option 1 economics."

If client says "no revenue share":
- "Then we can do pure assignment economics or increase upfront license value to preserve fair equivalence."
