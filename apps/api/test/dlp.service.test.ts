import { UserRole } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DlpService } from '../src/modules/dlp/dlp.service.js';

const privateKeyFixture = `${'-'.repeat(5)}BEGIN PRIV${'ATE'} KEY${'-'.repeat(5)}\nabc`;

describe('DlpService', () => {
  let originalEnabled: string | undefined;
  let originalPolicyId: string | undefined;
  let originalMaxScanBytes: string | undefined;
  let originalAdminOverrideEnabled: string | undefined;
  let originalOverrideRequireReason: string | undefined;
  let originalOverrideMinReasonLength: string | undefined;
  let originalOverrideRequireTicket: string | undefined;
  let originalOverrideTicketPattern: string | undefined;

  beforeEach(() => {
    originalEnabled = process.env.DLP_ENGINE_ENABLED;
    originalPolicyId = process.env.DLP_POLICY_ID;
    originalMaxScanBytes = process.env.DLP_MAX_SCAN_BYTES;
    originalAdminOverrideEnabled = process.env.DLP_ADMIN_OVERRIDE_ENABLED;
    originalOverrideRequireReason = process.env.DLP_ADMIN_OVERRIDE_REQUIRE_REASON;
    originalOverrideMinReasonLength = process.env.DLP_ADMIN_OVERRIDE_MIN_REASON_LENGTH;
    originalOverrideRequireTicket = process.env.DLP_ADMIN_OVERRIDE_REQUIRE_TICKET;
    originalOverrideTicketPattern = process.env.DLP_ADMIN_OVERRIDE_TICKET_PATTERN;
  });

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env.DLP_ENGINE_ENABLED;
    } else {
      process.env.DLP_ENGINE_ENABLED = originalEnabled;
    }

    if (originalPolicyId === undefined) {
      delete process.env.DLP_POLICY_ID;
    } else {
      process.env.DLP_POLICY_ID = originalPolicyId;
    }

    if (originalMaxScanBytes === undefined) {
      delete process.env.DLP_MAX_SCAN_BYTES;
    } else {
      process.env.DLP_MAX_SCAN_BYTES = originalMaxScanBytes;
    }

    if (originalAdminOverrideEnabled === undefined) {
      delete process.env.DLP_ADMIN_OVERRIDE_ENABLED;
    } else {
      process.env.DLP_ADMIN_OVERRIDE_ENABLED = originalAdminOverrideEnabled;
    }

    if (originalOverrideRequireReason === undefined) {
      delete process.env.DLP_ADMIN_OVERRIDE_REQUIRE_REASON;
    } else {
      process.env.DLP_ADMIN_OVERRIDE_REQUIRE_REASON = originalOverrideRequireReason;
    }

    if (originalOverrideMinReasonLength === undefined) {
      delete process.env.DLP_ADMIN_OVERRIDE_MIN_REASON_LENGTH;
    } else {
      process.env.DLP_ADMIN_OVERRIDE_MIN_REASON_LENGTH = originalOverrideMinReasonLength;
    }

    if (originalOverrideRequireTicket === undefined) {
      delete process.env.DLP_ADMIN_OVERRIDE_REQUIRE_TICKET;
    } else {
      process.env.DLP_ADMIN_OVERRIDE_REQUIRE_TICKET = originalOverrideRequireTicket;
    }

    if (originalOverrideTicketPattern === undefined) {
      delete process.env.DLP_ADMIN_OVERRIDE_TICKET_PATTERN;
    } else {
      process.env.DLP_ADMIN_OVERRIDE_TICKET_PATTERN = originalOverrideTicketPattern;
    }
  });

  it('allows when DLP engine is disabled', () => {
    process.env.DLP_ENGINE_ENABLED = 'false';

    const service = new DlpService();
    const decision = service.evaluateUpload({
      filename: 'safe.txt',
      contentType: 'text/plain',
      plaintext: Buffer.from('hello world', 'utf8'),
    });

    expect(decision.verdict).toBe('allow');
    expect(decision.matches).toEqual([]);
    expect(decision.reason).toBe('engine_disabled');
  });

  it('denies upload corpus containing SSN-like data', () => {
    process.env.DLP_ENGINE_ENABLED = 'true';
    process.env.DLP_POLICY_ID = 'dlp-baseline-v2';

    const service = new DlpService();
    const decision = service.evaluateUpload({
      filename: 'employee-export.txt',
      contentType: 'text/plain',
      plaintext: Buffer.from('employee_ssn=123-45-6789', 'utf8'),
    });

    expect(decision.policyId).toBe('dlp-baseline-v2');
    expect(decision.verdict).toBe('deny');
    expect(decision.enforcementAction).toBe('block');
    expect(decision.matches).toContain('pii.ssn');
    expect(decision.overridable).toBe(true);
  });

  it('detects valid card-like data with luhn check and avoids false positives', () => {
    process.env.DLP_ENGINE_ENABLED = 'true';

    const service = new DlpService();
    const positive = service.evaluateUpload({
      filename: 'billing.txt',
      contentType: 'text/plain',
      plaintext: Buffer.from('card=4111 1111 1111 1111', 'utf8'),
    });
    const negative = service.evaluateUpload({
      filename: 'analytics.txt',
      contentType: 'text/plain',
      plaintext: Buffer.from('account=1234 5678 9012 3456', 'utf8'),
    });

    expect(positive.verdict).toBe('deny');
    expect(positive.matches).toContain('pii.credit_card');
    expect(negative.verdict).toBe('allow');
  });

  it('denies non-overridable secret markers for upload payloads', () => {
    process.env.DLP_ENGINE_ENABLED = 'true';

    const service = new DlpService();
    const decision = service.evaluateUpload({
      filename: 'keys.pem',
      contentType: 'text/plain',
      plaintext: Buffer.from(privateKeyFixture, 'utf8'),
    });

    expect(decision.verdict).toBe('deny');
    expect(decision.matches).toContain('secret.private_key_block');
    expect(decision.overridable).toBe(false);
  });

  it('denies share checks for sensitive filename markers', () => {
    process.env.DLP_ENGINE_ENABLED = 'true';

    const service = new DlpService();
    const decision = service.evaluateShare({
      filename: 'prod-secret-token.txt',
      contentType: 'text/plain',
    });

    expect(decision.verdict).toBe('deny');
    expect(decision.matches).toContain('secret.sensitive_filename');
  });

  it('allows governed admin override for overridable matches when reason is sufficient', () => {
    process.env.DLP_ENGINE_ENABLED = 'true';
    process.env.DLP_ADMIN_OVERRIDE_ENABLED = 'true';
    process.env.DLP_ADMIN_OVERRIDE_REQUIRE_REASON = 'true';
    process.env.DLP_ADMIN_OVERRIDE_MIN_REASON_LENGTH = '20';

    const service = new DlpService();
    const decision = service.evaluateShare({
      filename: 'secret-plan.txt',
      contentType: 'text/plain',
    });

    const overrideEvaluation = service.evaluateAdminOverride({
      role: UserRole.admin,
      decision,
      overrideReason: 'Security review approved controlled external transfer',
    });

    expect(overrideEvaluation.allowed).toBe(true);
    expect(overrideEvaluation.reason).toBe('override_allowed');
  });

  it('blocks override when reason is missing or too short', () => {
    process.env.DLP_ENGINE_ENABLED = 'true';
    process.env.DLP_ADMIN_OVERRIDE_ENABLED = 'true';
    process.env.DLP_ADMIN_OVERRIDE_REQUIRE_REASON = 'true';
    process.env.DLP_ADMIN_OVERRIDE_MIN_REASON_LENGTH = '24';

    const service = new DlpService();
    const decision = service.evaluateShare({
      filename: 'secret-plan.txt',
      contentType: 'text/plain',
    });

    const missingReason = service.evaluateAdminOverride({
      role: UserRole.admin,
      decision,
      overrideReason: '',
    });
    const shortReason = service.evaluateAdminOverride({
      role: UserRole.admin,
      decision,
      overrideReason: 'approved by lead',
    });

    expect(missingReason.allowed).toBe(false);
    expect(missingReason.reason).toBe('override_reason_required');
    expect(shortReason.allowed).toBe(false);
    expect(shortReason.reason).toBe('override_reason_too_short');
  });

  it('blocks override for non-admin roles even when override mode is enabled', () => {
    process.env.DLP_ENGINE_ENABLED = 'true';
    process.env.DLP_ADMIN_OVERRIDE_ENABLED = 'true';

    const service = new DlpService();
    const decision = service.evaluateShare({
      filename: 'secret-plan.txt',
      contentType: 'text/plain',
    });

    const overrideEvaluation = service.evaluateAdminOverride({
      role: UserRole.member,
      decision,
      overrideReason: 'Security approved transfer for controlled test exercise',
    });

    expect(overrideEvaluation.allowed).toBe(false);
    expect(overrideEvaluation.reason).toBe('role_not_admin');
  });

  it('blocks override when override mode is disabled', () => {
    process.env.DLP_ENGINE_ENABLED = 'true';
    process.env.DLP_ADMIN_OVERRIDE_ENABLED = 'false';

    const service = new DlpService();
    const decision = service.evaluateShare({
      filename: 'secret-plan.txt',
      contentType: 'text/plain',
    });

    const overrideEvaluation = service.evaluateAdminOverride({
      role: UserRole.admin,
      decision,
      overrideReason: 'Security approved transfer for controlled test exercise',
    });

    expect(overrideEvaluation.allowed).toBe(false);
    expect(overrideEvaluation.reason).toBe('override_disabled');
  });

  it('blocks override for non-overridable secret matches', () => {
    process.env.DLP_ENGINE_ENABLED = 'true';
    process.env.DLP_ADMIN_OVERRIDE_ENABLED = 'true';

    const service = new DlpService();
    const decision = service.evaluateUpload({
      filename: 'sensitive.pem',
      contentType: 'text/plain',
      plaintext: Buffer.from(privateKeyFixture, 'utf8'),
    });

    const overrideEvaluation = service.evaluateAdminOverride({
      role: UserRole.admin,
      decision,
      overrideReason: 'Security approved transfer for controlled test exercise',
    });

    expect(overrideEvaluation.allowed).toBe(false);
    expect(overrideEvaluation.reason).toBe('non_overridable_match');
  });

  it('enforces ticket requirements when configured', () => {
    process.env.DLP_ENGINE_ENABLED = 'true';
    process.env.DLP_ADMIN_OVERRIDE_ENABLED = 'true';
    process.env.DLP_ADMIN_OVERRIDE_REQUIRE_REASON = 'true';
    process.env.DLP_ADMIN_OVERRIDE_REQUIRE_TICKET = 'true';
    process.env.DLP_ADMIN_OVERRIDE_TICKET_PATTERN = '^SEC-[0-9]{3,}$';

    const service = new DlpService();
    const decision = service.evaluateShare({
      filename: 'secret-plan.txt',
      contentType: 'text/plain',
    });

    const invalidTicket = service.evaluateAdminOverride({
      role: UserRole.admin,
      decision,
      overrideReason: 'Security reviewed approved transfer for controlled external delivery',
      overrideTicket: 'INC-42',
    });
    const missingTicket = service.evaluateAdminOverride({
      role: UserRole.admin,
      decision,
      overrideReason: 'Security reviewed approved transfer for controlled external delivery',
      overrideTicket: '',
    });
    const validTicket = service.evaluateAdminOverride({
      role: UserRole.admin,
      decision,
      overrideReason: 'Security reviewed approved transfer for controlled external delivery',
      overrideTicket: 'SEC-1042',
    });

    expect(missingTicket.allowed).toBe(false);
    expect(missingTicket.reason).toBe('override_ticket_required');
    expect(invalidTicket.allowed).toBe(false);
    expect(invalidTicket.reason).toBe('override_ticket_invalid');
    expect(validTicket.allowed).toBe(true);
  });
});
