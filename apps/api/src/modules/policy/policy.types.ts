import { UserRole } from '@prisma/client';

export type PolicyActor = {
  type: 'user' | 'share_link' | 'system';
  id: string | null;
  role?: UserRole | null;
  email?: string | null;
};

export type PolicyResource = {
  type: string;
  id: string | null;
  orgId?: string | null;
  ownerUserId?: string | null;
};

export type PolicyDecisionInput = {
  action: string;
  actor: PolicyActor;
  resource: PolicyResource;
  context?: Record<string, unknown>;
};

export type PolicyDecision = {
  allowed: boolean;
  source: 'disabled' | 'opa' | 'opa_error' | 'fallback_allow';
  reason: string;
};
