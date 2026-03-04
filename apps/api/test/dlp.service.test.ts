import { UserRole } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DlpService } from '../src/modules/dlp/dlp.service.js';

describe('DlpService', () => {
  let originalEnabled: string | undefined;
  let originalPolicyId: string | undefined;
  let originalMaxScanBytes: string | undefined;
  let originalAdminOverrideEnabled: string | undefined;

  beforeEach(() => {
    originalEnabled = process.env.DLP_ENGINE_ENABLED;
    originalPolicyId = process.env.DLP_POLICY_ID;
    originalMaxScanBytes = process.env.DLP_MAX_SCAN_BYTES;
    originalAdminOverrideEnabled = process.env.DLP_ADMIN_OVERRIDE_ENABLED;
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
  });

  it('does not false-positive on benign numeric content', () => {
    process.env.DLP_ENGINE_ENABLED = 'true';

    const service = new DlpService();
    const decision = service.evaluateUpload({
      filename: 'analytics.txt',
      contentType: 'text/plain',
      plaintext: Buffer.from('account: 123456789, growth: 20%', 'utf8'),
    });

    expect(decision.verdict).toBe('allow');
    expect(decision.matches).toEqual([]);
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

  it('supports admin override when enabled', () => {
    process.env.DLP_ENGINE_ENABLED = 'true';
    process.env.DLP_ADMIN_OVERRIDE_ENABLED = 'true';

    const service = new DlpService();
    const decision = service.evaluateShare({
      filename: 'secret-plan.txt',
      contentType: 'text/plain',
    });

    expect(service.shouldAllowAdminOverride(UserRole.admin, decision)).toBe(true);
    expect(service.shouldAllowAdminOverride(UserRole.member, decision)).toBe(false);
  });
});
