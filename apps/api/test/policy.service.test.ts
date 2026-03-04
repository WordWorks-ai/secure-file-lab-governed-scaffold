import { ForbiddenException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PolicyService } from '../src/modules/policy/policy.service.js';
import { PolicyDecisionInput } from '../src/modules/policy/policy.types.js';

const sampleInput: PolicyDecisionInput = {
  action: 'file.upload',
  actor: {
    type: 'user',
    id: 'user-1',
    role: 'member',
    email: 'user@example.test',
  },
  resource: {
    type: 'file',
    id: 'file-1',
    orgId: 'org-1',
  },
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  delete process.env.POLICY_ENGINE_ENABLED;
  delete process.env.POLICY_ENGINE_FAIL_SAFE_DENY;
  delete process.env.POLICY_ENGINE_TIMEOUT_MS;
  delete process.env.OPA_BASE_URL;
  delete process.env.OPA_POLICY_PATH;
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('PolicyService', () => {
  it('allows when policy engine is disabled', async () => {
    const service = new PolicyService();
    await expect(service.assertAllowed(sampleInput)).resolves.toBeUndefined();
  });

  it('allows when OPA returns allow=true', async () => {
    process.env.POLICY_ENGINE_ENABLED = 'true';
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ result: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const service = new PolicyService();
    await expect(service.assertAllowed(sampleInput)).resolves.toBeUndefined();
  });

  it('denies when OPA returns allow=false', async () => {
    process.env.POLICY_ENGINE_ENABLED = 'true';
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ result: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const service = new PolicyService();
    await expect(service.assertAllowed(sampleInput)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies on policy engine errors when fail-safe deny is enabled', async () => {
    process.env.POLICY_ENGINE_ENABLED = 'true';
    process.env.POLICY_ENGINE_FAIL_SAFE_DENY = 'true';
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network failed');
    }) as unknown as typeof fetch;

    const service = new PolicyService();
    await expect(service.assertAllowed(sampleInput)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows on policy engine errors when fail-safe deny is disabled', async () => {
    process.env.POLICY_ENGINE_ENABLED = 'true';
    process.env.POLICY_ENGINE_FAIL_SAFE_DENY = 'false';
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network failed');
    }) as unknown as typeof fetch;

    const service = new PolicyService();
    await expect(service.assertAllowed(sampleInput)).resolves.toBeUndefined();
  });
});
