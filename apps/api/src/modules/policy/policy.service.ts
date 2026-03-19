import { ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PolicyDecision, PolicyDecisionInput } from './policy.types.js';

type OpaResponse = {
  result?: boolean | { allow?: boolean; reason?: string };
};

@Injectable()
export class PolicyService implements OnModuleInit {
  private readonly logger = new Logger(PolicyService.name);

  onModuleInit(): void {
    if (!this.isPolicyEngineEnabled()) {
      const env = process.env.NODE_ENV ?? 'development';
      if (env !== 'development' && env !== 'test') {
        this.logger.warn(
          'SECURITY WARNING: Policy engine is DISABLED. All policy decisions will default to allowed. ' +
            'Enable POLICY_ENGINE_ENABLED=true for production environments.',
        );
      }
    }
    if (!this.failSafeDeny()) {
      this.logger.warn(
        'SECURITY WARNING: POLICY_ENGINE_FAIL_SAFE_DENY is false. ' +
          'OPA errors will result in allowing requests instead of denying.',
      );
    }
  }

  async assertAllowed(input: PolicyDecisionInput): Promise<void> {
    const decision = await this.evaluate(input);
    if (!decision.allowed) {
      throw new ForbiddenException('Policy denied action');
    }
  }

  async evaluate(input: PolicyDecisionInput): Promise<PolicyDecision> {
    const localAbacDecision = this.evaluateLocalAbac(input);
    if (localAbacDecision) {
      return localAbacDecision;
    }

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

  private evaluateLocalAbac(input: PolicyDecisionInput): PolicyDecision | null {
    if (!this.localAbacEnabled()) {
      return null;
    }

    if (input.actor.type === 'user' && !input.actor.id?.trim()) {
      return this.denyByLocalAbac('missing_actor_id');
    }

    const resourceOrgId = input.resource.orgId?.trim();
    const actorOrgId =
      typeof input.context?.actorOrgId === 'string' ? input.context.actorOrgId.trim() : undefined;
    if (
      resourceOrgId &&
      actorOrgId &&
      resourceOrgId.length > 0 &&
      actorOrgId.length > 0 &&
      resourceOrgId !== actorOrgId
    ) {
      return this.denyByLocalAbac('org_scope_mismatch');
    }

    if (input.action === 'file.download') {
      const status = this.readContextString(input.context?.fileStatus);
      if (status && status !== 'active') {
        return this.denyByLocalAbac('file_not_active');
      }

      if (this.isMemberActor(input) && this.resourceOwnerMismatch(input)) {
        return this.denyByLocalAbac('member_not_owner');
      }
    }

    if (input.action === 'share.create') {
      if (this.isMemberActor(input) && this.resourceOwnerMismatch(input)) {
        return this.denyByLocalAbac('member_not_owner');
      }
    }

    if (input.action === 'share.revoke') {
      if (this.isMemberActor(input) && this.resourceOwnerMismatch(input)) {
        const actorId = input.actor.id?.trim();
        const shareCreatedByUserId = this.readContextString(input.context?.shareCreatedByUserId);
        if (!actorId || !shareCreatedByUserId || shareCreatedByUserId !== actorId) {
          return this.denyByLocalAbac('member_not_share_manager');
        }
      }
    }

    return null;
  }

  private denyByLocalAbac(reason: string): PolicyDecision {
    return {
      allowed: false,
      source: 'local_abac',
      reason,
    };
  }

  private localAbacEnabled(): boolean {
    return this.readBooleanEnv('POLICY_LOCAL_ABAC_ENABLED', true);
  }

  private isMemberActor(input: PolicyDecisionInput): boolean {
    const membershipRole = this.readContextString(input.context?.membershipRole);
    return membershipRole === 'member';
  }

  private resourceOwnerMismatch(input: PolicyDecisionInput): boolean {
    const actorId = input.actor.id?.trim();
    const ownerUserId = input.resource.ownerUserId?.trim();
    if (!actorId || !ownerUserId) {
      return false;
    }
    return actorId !== ownerUserId;
  }

  private readContextString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private isPolicyEngineEnabled(): boolean {
    return this.readBooleanEnv('POLICY_ENGINE_ENABLED', false);
  }

  private failSafeDeny(): boolean {
    return this.readBooleanEnv('POLICY_ENGINE_FAIL_SAFE_DENY', true);
  }

  private getPolicyDecisionUrl(): string {
    const base = (process.env.OPA_BASE_URL ?? 'http://opa:8181').replace(/\/+$/, '');
    const path = process.env.OPA_POLICY_PATH ?? '/v1/data/secure_file_lab/allow';
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
