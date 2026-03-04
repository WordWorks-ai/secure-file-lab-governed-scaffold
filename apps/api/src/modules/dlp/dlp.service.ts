import { UserRole } from '@prisma/client';
import { Injectable } from '@nestjs/common';

export type DlpDecision = {
  policyId: string;
  verdict: 'allow' | 'deny';
  enforcementAction: 'allow' | 'block';
  matches: string[];
  reason: string;
};

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
  }): DlpDecision {
    if (!this.isEnabled()) {
      return this.allowDecision('engine_disabled');
    }

    const corpus = `${input.filename}\n${input.contentType}`;
    const matches = this.detectMatches(corpus, 'share');
    if (matches.length === 0) {
      return this.allowDecision('no_matches');
    }

    return this.denyDecision(matches, 'share_sensitive_match');
  }

  shouldAllowAdminOverride(role: UserRole, decision: DlpDecision): boolean {
    return (
      decision.verdict === 'deny' &&
      role === UserRole.admin &&
      this.isAdminOverrideEnabled()
    );
  }

  private detectMatches(corpus: string, mode: 'upload' | 'share'): string[] {
    const matches: string[] = [];

    if (/\b\d{3}-\d{2}-\d{4}\b/.test(corpus)) {
      matches.push('pii.ssn');
    }

    if (/\bAKIA[0-9A-Z]{16}\b/.test(corpus)) {
      matches.push('secret.aws_access_key');
    }

    if (/\bpassword\s*[:=]\s*\S+/i.test(corpus)) {
      matches.push('secret.password_assignment');
    }

    if (mode === 'share' && /\b(secret|credential|api[_-]?key|token)\b/i.test(corpus)) {
      matches.push('secret.sensitive_filename');
    }

    return matches;
  }

  private extractTextForScan(contentType: string, plaintext: Buffer): string {
    const normalizedType = contentType.trim().toLowerCase();
    if (!normalizedType.startsWith('text/') && normalizedType !== 'application/json') {
      return '';
    }

    return plaintext.subarray(0, this.getMaxScanBytes()).toString('utf8');
  }

  private allowDecision(reason: string): DlpDecision {
    return {
      policyId: this.getPolicyId(),
      verdict: 'allow',
      enforcementAction: 'allow',
      matches: [],
      reason,
    };
  }

  private denyDecision(matches: string[], reason: string): DlpDecision {
    return {
      policyId: this.getPolicyId(),
      verdict: 'deny',
      enforcementAction: 'block',
      matches,
      reason,
    };
  }

  private isEnabled(): boolean {
    return (process.env.DLP_ENGINE_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  }

  private isAdminOverrideEnabled(): boolean {
    return (process.env.DLP_ADMIN_OVERRIDE_ENABLED ?? 'false').trim().toLowerCase() === 'true';
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
