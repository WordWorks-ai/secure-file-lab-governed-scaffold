import { ForbiddenException, Injectable } from '@nestjs/common';

import { PolicyDecision, PolicyDecisionInput } from './policy.types.js';

type OpaResponse = {
  result?: boolean | { allow?: boolean; reason?: string };
};

@Injectable()
export class PolicyService {
  async assertAllowed(input: PolicyDecisionInput): Promise<void> {
    const decision = await this.evaluate(input);
    if (!decision.allowed) {
      throw new ForbiddenException('Policy denied action');
    }
  }

  async evaluate(input: PolicyDecisionInput): Promise<PolicyDecision> {
    if (!this.isPolicyEngineEnabled()) {
      return {
        allowed: true,
        source: 'disabled',
        reason: 'policy_engine_disabled',
      };
    }

    try {
      const response = await this.postDecisionRequest(input);
      if (!response.ok) {
        return this.handlePolicyEngineError(`policy_http_${response.status}`);
      }

      const payload = (await response.json()) as OpaResponse;
      const extracted = this.extractDecision(payload);

      if (extracted.allowed) {
        return {
          allowed: true,
          source: 'opa',
          reason: extracted.reason ?? 'policy_allow',
        };
      }

      return {
        allowed: false,
        source: 'opa',
        reason: extracted.reason ?? 'policy_deny',
      };
    } catch {
      return this.handlePolicyEngineError('policy_engine_unavailable');
    }
  }

  private async postDecisionRequest(input: PolicyDecisionInput): Promise<Response> {
    const controller = new AbortController();
    const timeoutMs = this.getPolicyTimeoutMs();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(this.getPolicyDecisionUrl(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private handlePolicyEngineError(reason: string): PolicyDecision {
    if (this.failSafeDeny()) {
      return {
        allowed: false,
        source: 'opa_error',
        reason,
      };
    }

    return {
      allowed: true,
      source: 'fallback_allow',
      reason,
    };
  }

  private extractDecision(payload: OpaResponse): { allowed: boolean; reason?: string } {
    if (typeof payload.result === 'boolean') {
      return {
        allowed: payload.result,
      };
    }

    if (payload.result && typeof payload.result === 'object') {
      const allow = payload.result.allow;
      const reason = payload.result.reason;
      return {
        allowed: allow === true,
        reason: typeof reason === 'string' ? reason : undefined,
      };
    }

    return {
      allowed: false,
      reason: 'policy_result_missing',
    };
  }

  private isPolicyEngineEnabled(): boolean {
    return this.readBooleanEnv('POLICY_ENGINE_ENABLED', false);
  }

  private failSafeDeny(): boolean {
    return this.readBooleanEnv('POLICY_ENGINE_FAIL_SAFE_DENY', true);
  }

  private getPolicyDecisionUrl(): string {
    const base = (process.env.OPA_BASE_URL ?? 'http://opa:8181').replace(/\/+$/, '');
    const path = process.env.OPA_POLICY_PATH ?? '/v1/data/schwass/allow';
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }

  private getPolicyTimeoutMs(): number {
    const raw = Number(process.env.POLICY_ENGINE_TIMEOUT_MS ?? 3000);
    if (Number.isFinite(raw) && raw > 0) {
      return Math.floor(raw);
    }

    return 3000;
  }

  private readBooleanEnv(name: string, defaultValue: boolean): boolean {
    const value = process.env[name];
    if (!value) {
      return defaultValue;
    }

    return value.trim().toLowerCase() === 'true';
  }
}
