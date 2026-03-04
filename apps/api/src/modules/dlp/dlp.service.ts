import { UserRole } from '@prisma/client';
import { Injectable } from '@nestjs/common';

export type DlpDecision = {
  policyId: string;
  verdict: 'allow' | 'deny';
  enforcementAction: 'allow' | 'block';
  matches: string[];
  overridable: boolean;
  reason: string;
};

export type DlpOverrideEvaluation = {
  allowed: boolean;
  reason:
    | 'override_allowed'
    | 'decision_not_denied'
    | 'role_not_admin'
    | 'override_disabled'
    | 'non_overridable_match'
    | 'override_reason_required'
    | 'override_reason_too_short'
    | 'override_ticket_required'
    | 'override_ticket_invalid';
};

type DlpMode = 'upload' | 'share';

type DlpRule = {
  id: string;
  mode: DlpMode | 'all';
  overridable: boolean;
  matches: (corpus: string) => boolean;
};

const DLP_RULES: DlpRule[] = [
  {
    id: 'pii.ssn',
    mode: 'all',
    overridable: true,
    matches: (corpus) => /\b\d{3}-\d{2}-\d{4}\b/.test(corpus),
  },
  {
    id: 'pii.credit_card',
    mode: 'upload',
    overridable: true,
    matches: (corpus) => containsLikelyCreditCard(corpus),
  },
  {
    id: 'secret.aws_access_key',
    mode: 'all',
    overridable: false,
    matches: (corpus) => /\bAKIA[0-9A-Z]{16}\b/.test(corpus),
  },
  {
    id: 'secret.aws_secret_access_key',
    mode: 'upload',
    overridable: false,
    matches: (corpus) =>
      /\baws(.{0,20})?secret(.{0,20})?(access)?(.{0,20})?key\s*[:=]\s*[A-Za-z0-9/+]{32,}={0,2}\b/i.test(
        corpus,
      ),
  },
  {
    id: 'secret.password_assignment',
    mode: 'all',
    overridable: false,
    matches: (corpus) => /\b(?:password|passwd|pwd)\s*[:=]\s*\S+/i.test(corpus),
  },
  {
    id: 'secret.private_key_block',
    mode: 'upload',
    overridable: false,
    matches: (corpus) => /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(corpus),
  },
  {
    id: 'secret.github_pat',
    mode: 'upload',
    overridable: false,
    matches: (corpus) => /\bgh[pousr]_[A-Za-z0-9]{36}\b/.test(corpus),
  },
  {
    id: 'secret.api_token_assignment',
    mode: 'upload',
    overridable: false,
    matches: (corpus) => /\b(?:api[_-]?key|token|bearer)\s*[:=]\s*[A-Za-z0-9_\-.]{16,}\b/i.test(corpus),
  },
  {
    id: 'secret.sensitive_filename',
    mode: 'share',
    overridable: true,
    matches: (corpus) => /\b(secret|credential|api[_-]?key|token|private-key|key-material)\b/i.test(corpus),
  },
];

const STRUCTURED_TEXT_CONTENT_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/x-ndjson',
  'application/yaml',
  'application/x-yaml',
]);

const RULE_OVERRIDABLE_BY_ID = new Map(DLP_RULES.map((rule) => [rule.id, rule.overridable]));

function containsLikelyCreditCard(corpus: string): boolean {
  const candidates = corpus.match(/\b(?:\d[ -]*?){13,19}\b/g) ?? [];
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) {
      continue;
    }

    if (passesLuhn(digits)) {
      return true;
    }
  }

  return false;
}

function passesLuhn(value: string): boolean {
  let checksum = 0;
  let shouldDouble = false;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number.parseInt(value[index] ?? '0', 10);
    if (!Number.isFinite(digit)) {
      return false;
    }

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    checksum += digit;
    shouldDouble = !shouldDouble;
  }

  return checksum % 10 === 0;
}

@Injectable()
export class DlpService {
  evaluateUpload(input: {
    filename: string;
    contentType: string;
    plaintext: Buffer;
  }): DlpDecision {
    if (!this.isEnabled()) {
      return this.allowDecision('engine_disabled');
    }

    const corpus = `${input.filename}\n${this.extractTextForScan(input.contentType, input.plaintext)}`;
    const matches = this.detectMatches(corpus, 'upload');
    if (matches.length === 0) {
      return this.allowDecision('no_matches');
    }

    return this.denyDecision(matches, 'upload_sensitive_match');
  }

  evaluateShare(input: {
    filename: string;
    contentType: string;
    derivedText?: string;
  }): DlpDecision {
    if (!this.isEnabled()) {
      return this.allowDecision('engine_disabled');
    }

    const corpus = `${input.filename}\n${input.contentType}\n${input.derivedText ?? ''}`;
    const matches = this.detectMatches(corpus, 'share');
    if (matches.length === 0) {
      return this.allowDecision('no_matches');
    }

    return this.denyDecision(matches, 'share_sensitive_match');
  }

  evaluateAdminOverride(input: {
    role: UserRole;
    decision: DlpDecision;
    overrideReason?: string | null;
    overrideTicket?: string | null;
  }): DlpOverrideEvaluation {
    if (input.decision.verdict !== 'deny') {
      return {
        allowed: false,
        reason: 'decision_not_denied',
      };
    }

    if (input.role !== UserRole.admin) {
      return {
        allowed: false,
        reason: 'role_not_admin',
      };
    }

    if (!this.isAdminOverrideEnabled()) {
      return {
        allowed: false,
        reason: 'override_disabled',
      };
    }

    if (!input.decision.overridable) {
      return {
        allowed: false,
        reason: 'non_overridable_match',
      };
    }

    const normalizedReason = (input.overrideReason ?? '').trim();
    if (this.isOverrideReasonRequired()) {
      if (normalizedReason.length === 0) {
        return {
          allowed: false,
          reason: 'override_reason_required',
        };
      }

      if (normalizedReason.length < this.getOverrideMinReasonLength()) {
        return {
          allowed: false,
          reason: 'override_reason_too_short',
        };
      }
    }

    const normalizedTicket = (input.overrideTicket ?? '').trim();
    if (this.isOverrideTicketRequired()) {
      if (normalizedTicket.length === 0) {
        return {
          allowed: false,
          reason: 'override_ticket_required',
        };
      }

      if (!this.getOverrideTicketPattern().test(normalizedTicket)) {
        return {
          allowed: false,
          reason: 'override_ticket_invalid',
        };
      }
    }

    return {
      allowed: true,
      reason: 'override_allowed',
    };
  }

  private detectMatches(corpus: string, mode: 'upload' | 'share'): string[] {
    const matches = new Set<string>();
    for (const rule of DLP_RULES) {
      if (rule.mode !== 'all' && rule.mode !== mode) {
        continue;
      }

      if (rule.matches(corpus)) {
        matches.add(rule.id);
      }
    }

    return [...matches].sort((left, right) => left.localeCompare(right));
  }

  private extractTextForScan(contentType: string, plaintext: Buffer): string {
    const bounded = plaintext.subarray(0, this.getMaxScanBytes());
    if (this.isTextContentType(contentType.trim().toLowerCase())) {
      return this.normalizeText(bounded.toString('utf8'));
    }

    // Derive printable fallback text for non-text payloads to improve detection depth.
    return this.extractPrintableText(bounded);
  }

  private isTextContentType(normalizedType: string): boolean {
    return normalizedType.startsWith('text/') || STRUCTURED_TEXT_CONTENT_TYPES.has(normalizedType);
  }

  private normalizeText(value: string): string {
    const withoutNull = value.split('\u0000').join(' ');
    return withoutNull.replace(/\s+/g, ' ').trim();
  }

  private extractPrintableText(value: Buffer): string {
    const sanitizedBytes: number[] = [];
    for (const byte of value.values()) {
      if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) {
        sanitizedBytes.push(byte);
        continue;
      }

      sanitizedBytes.push(32);
    }

    return Buffer.from(sanitizedBytes).toString('utf8').replace(/\s+/g, ' ').trim();
  }

  private allowDecision(reason: string): DlpDecision {
    return {
      policyId: this.getPolicyId(),
      verdict: 'allow',
      enforcementAction: 'allow',
      matches: [],
      overridable: false,
      reason,
    };
  }

  private denyDecision(matches: string[], reason: string): DlpDecision {
    const overridable = matches.every((matchId) => RULE_OVERRIDABLE_BY_ID.get(matchId) === true);

    return {
      policyId: this.getPolicyId(),
      verdict: 'deny',
      enforcementAction: 'block',
      matches,
      overridable,
      reason,
    };
  }

  private isEnabled(): boolean {
    return (process.env.DLP_ENGINE_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  }

  private isAdminOverrideEnabled(): boolean {
    return (process.env.DLP_ADMIN_OVERRIDE_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  }

  private isOverrideReasonRequired(): boolean {
    return (process.env.DLP_ADMIN_OVERRIDE_REQUIRE_REASON ?? 'true').trim().toLowerCase() !== 'false';
  }

  private getOverrideMinReasonLength(): number {
    const raw = Number(process.env.DLP_ADMIN_OVERRIDE_MIN_REASON_LENGTH ?? 24);
    if (Number.isFinite(raw) && raw >= 8) {
      return Math.floor(raw);
    }

    return 24;
  }

  private isOverrideTicketRequired(): boolean {
    return (process.env.DLP_ADMIN_OVERRIDE_REQUIRE_TICKET ?? 'false').trim().toLowerCase() === 'true';
  }

  private getOverrideTicketPattern(): RegExp {
    const raw = (process.env.DLP_ADMIN_OVERRIDE_TICKET_PATTERN ?? '^INC-[0-9]{4,}$').trim();
    if (!raw) {
      return /^INC-[0-9]{4,}$/;
    }

    try {
      return new RegExp(raw);
    } catch {
      return /^INC-[0-9]{4,}$/;
    }
  }

  private getPolicyId(): string {
    const policyId = (process.env.DLP_POLICY_ID ?? 'dlp-baseline-v1').trim();
    return policyId.length > 0 ? policyId : 'dlp-baseline-v1';
  }

  private getMaxScanBytes(): number {
    const raw = Number(process.env.DLP_MAX_SCAN_BYTES ?? 131_072);
    if (Number.isFinite(raw) && raw >= 1024) {
      return Math.floor(raw);
    }

    return 131_072;
  }
}
