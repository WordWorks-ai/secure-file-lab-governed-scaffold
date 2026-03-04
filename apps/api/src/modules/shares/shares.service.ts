import { hash, verify } from '@node-rs/argon2';
import {
  AuditActorType,
  AuditResult,
  FileStatus,
  MembershipRole,
} from '@prisma/client';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { AuditService } from '../audit/audit.service.js';
import { AuthenticatedUser } from '../auth/types/authenticated-request.js';
import { DlpDecision, DlpService } from '../dlp/dlp.service.js';
import { FileCryptoService } from '../files/file-crypto.service.js';
import { MinioObjectStorageService } from '../files/minio-object-storage.service.js';
import { VaultTransitService } from '../files/vault-transit.service.js';
import { PrismaService } from '../persistence/prisma.service.js';
import { PolicyService } from '../policy/policy.service.js';
import { PolicyDecisionInput } from '../policy/policy.types.js';
import { AccessShareDto } from './dto/access-share.dto.js';
import { CreateShareDto } from './dto/create-share.dto.js';

type RequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

@Injectable()
export class SharesService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(FileCryptoService) private readonly fileCryptoService: FileCryptoService,
    @Inject(MinioObjectStorageService)
    private readonly objectStorageService: MinioObjectStorageService,
    @Inject(VaultTransitService)
    private readonly vaultTransitService: VaultTransitService,
    @Inject(PolicyService) private readonly policyService: PolicyService,
    @Inject(DlpService) private readonly dlpService: DlpService,
  ) {}

  async createShare(
    payload: CreateShareDto,
    user: AuthenticatedUser,
    context: RequestContext,
  ): Promise<{
    shareId: string;
    fileId: string;
    shareToken: string;
    expiresAt: string;
    maxDownloads: number | null;
    requiresPassword: boolean;
  }> {
    const file = await this.prismaService.file.findUnique({
      where: { id: payload.fileId },
      select: {
        id: true,
        orgId: true,
        ownerUserId: true,
        filename: true,
        contentType: true,
        status: true,
      },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const membership = await this.requireMembership(user.sub, file.orgId);
    this.requireShareManagementPermission(user.sub, membership.role, file.ownerUserId, null);
    await this.enforcePolicy({
      action: 'share.create',
      actor: {
        type: 'user',
        id: user.sub,
        role: user.role,
        email: user.email,
      },
      resource: {
        type: 'file',
        id: file.id,
        orgId: file.orgId,
        ownerUserId: file.ownerUserId,
      },
      context: {
        membershipRole: membership.role,
      },
    });

    if (file.status !== FileStatus.active) {
      throw new UnprocessableEntityException('Only active files can be shared');
    }

    const artifact = await this.prismaService.fileArtifact.findUnique({
      where: {
        fileId: file.id,
      },
      select: {
        previewText: true,
        ocrText: true,
      },
    });

    const dlpEvaluation = await this.enforceShareCreateDlp(
      {
        ...file,
        derivedText: [artifact?.previewText ?? '', artifact?.ocrText ?? ''].join('\n').trim(),
      },
      user,
      context,
      {
        reason: payload.dlpOverrideReason,
        ticket: payload.dlpOverrideTicket,
      },
    );

    const expiresAt = this.parseShareExpiry(payload.expiresAt);
    const shareToken = this.generateShareToken();
    const tokenHash = this.hashShareToken(shareToken);
    const passwordHash = payload.password
      ? await hash(payload.password, {
          algorithm: 2,
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        })
      : null;

    const created = await this.prismaService.share.create({
      data: {
        fileId: file.id,
        orgId: file.orgId,
        createdByUserId: user.sub,
        tokenHash,
        passwordHash,
        maxDownloads: payload.maxDownloads ?? null,
        expiresAt,
      },
    });

    await this.auditService.recordEvent({
      action: 'share.create',
      resourceType: 'share',
      resourceId: created.id,
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.sub,
      orgId: file.orgId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        fileId: file.id,
        expiresAt: created.expiresAt.toISOString(),
        maxDownloads: created.maxDownloads,
        passwordProtected: Boolean(passwordHash),
        dlpPolicyId: dlpEvaluation.policyId,
        dlpVerdict: dlpEvaluation.overrideApplied ? 'override_allow' : dlpEvaluation.verdict,
        dlpMatches: dlpEvaluation.matches,
      },
    });

    return {
      shareId: created.id,
      fileId: file.id,
      shareToken,
      expiresAt: created.expiresAt.toISOString(),
      maxDownloads: created.maxDownloads,
      requiresPassword: Boolean(passwordHash),
    };
  }

  async revokeShare(
    shareId: string,
    user: AuthenticatedUser,
    context: RequestContext,
  ): Promise<{ shareId: string; revokedAt: string }> {
    const share = await this.prismaService.share.findUnique({
      where: { id: shareId },
      include: {
        file: {
          select: {
            ownerUserId: true,
          },
        },
      },
    });
    if (!share) {
      throw new NotFoundException('Share not found');
    }

    const membership = await this.requireMembership(user.sub, share.orgId);
    this.requireShareManagementPermission(
      user.sub,
      membership.role,
      share.file.ownerUserId,
      share.createdByUserId,
    );
    await this.enforcePolicy({
      action: 'share.revoke',
      actor: {
        type: 'user',
        id: user.sub,
        role: user.role,
        email: user.email,
      },
      resource: {
        type: 'share',
        id: share.id,
        orgId: share.orgId,
        ownerUserId: share.file.ownerUserId,
      },
      context: {
        membershipRole: membership.role,
      },
    });

    const revokedAt = share.revokedAt ?? new Date();
    if (!share.revokedAt) {
      await this.prismaService.share.update({
        where: { id: share.id },
        data: { revokedAt },
      });
    }

    await this.auditService.recordEvent({
      action: 'share.revoke',
      resourceType: 'share',
      resourceId: share.id,
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.sub,
      orgId: share.orgId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        fileId: share.fileId,
        alreadyRevoked: Boolean(share.revokedAt),
      },
    });

    return {
      shareId: share.id,
      revokedAt: revokedAt.toISOString(),
    };
  }

  async accessShare(
    payload: AccessShareDto,
    context: RequestContext,
  ): Promise<{
    shareId: string;
    fileId: string;
    filename: string;
    contentType: string;
    contentBase64: string;
  }> {
    const tokenHash = this.hashShareToken(payload.shareToken);
    const share = await this.prismaService.share.findUnique({
      where: { tokenHash },
      include: {
        file: {
          select: {
            id: true,
            orgId: true,
            filename: true,
            contentType: true,
            storageKey: true,
            status: true,
            wrappedDek: true,
            encryptionIv: true,
            encryptionTag: true,
          },
        },
      },
    });
    if (!share) {
      await this.auditService.recordEvent({
        action: 'share.access',
        resourceType: 'share',
        result: AuditResult.denied,
        actorType: AuditActorType.system,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { reason: 'token_not_found' },
      });
      throw new ForbiddenException('Invalid or expired share token');
    }
    await this.enforcePolicy({
      action: 'share.access',
      actor: {
        type: 'share_link',
        id: null,
      },
      resource: {
        type: 'share',
        id: share.id,
        orgId: share.orgId,
      },
      context: {
        fileStatus: share.file.status,
      },
    });

    const now = new Date();
    if (share.revokedAt) {
      await this.denyShareAccess(share.id, share.orgId, 'share_revoked', context);
    }
    if (share.expiresAt.getTime() <= now.getTime()) {
      await this.denyShareAccess(share.id, share.orgId, 'share_expired', context);
    }
    if (share.file.status !== FileStatus.active) {
      await this.denyShareAccess(share.id, share.orgId, 'file_not_active', context);
    }
    if (share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) {
      await this.denyShareAccess(share.id, share.orgId, 'download_limit_reached', context);
    }

    if (share.passwordHash) {
      const passwordValid = payload.password
        ? await this.verifyPassword(share.passwordHash, payload.password)
        : false;
      if (!passwordValid) {
        await this.denyShareAccess(share.id, share.orgId, 'invalid_password', context);
      }
    }

    const wrappedDek = share.file.wrappedDek;
    const encryptionIv = share.file.encryptionIv;
    const encryptionTag = share.file.encryptionTag;
    if (!wrappedDek || !encryptionIv || !encryptionTag) {
      await this.denyShareAccess(share.id, share.orgId, 'missing_encryption_metadata', context);
      throw new ForbiddenException('Invalid or expired share token');
    }
    const safeWrappedDek = wrappedDek as string;
    const safeEncryptionIv = encryptionIv as string;
    const safeEncryptionTag = encryptionTag as string;

    if (share.maxDownloads === null) {
      await this.prismaService.share.update({
        where: { id: share.id },
        data: {
          downloadCount: {
            increment: 1,
          },
        },
      });
    } else {
      const incremented = await this.prismaService.share.updateMany({
        where: {
          id: share.id,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
          downloadCount: {
            lt: share.maxDownloads,
          },
        },
        data: {
          downloadCount: {
            increment: 1,
          },
        },
      });
      if (incremented.count === 0) {
        await this.denyShareAccess(share.id, share.orgId, 'download_limit_reached', context);
      }
    }

    const ciphertext = await this.objectStorageService.getObject(share.file.storageKey);
    const dek = await this.vaultTransitService.unwrapDek(safeWrappedDek);
    const plaintext = this.fileCryptoService.decrypt(
      ciphertext,
      dek,
      Buffer.from(safeEncryptionIv, 'base64'),
      Buffer.from(safeEncryptionTag, 'base64'),
    );

    await this.auditService.recordEvent({
      action: 'share.access',
      resourceType: 'share',
      resourceId: share.id,
      result: AuditResult.success,
      actorType: AuditActorType.share_link,
      orgId: share.orgId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        fileId: share.file.id,
        bytesReturned: plaintext.byteLength,
      },
    });
    await this.auditService.recordEvent({
      action: 'file.download.attempt',
      resourceType: 'file',
      resourceId: share.file.id,
      result: AuditResult.success,
      actorType: AuditActorType.share_link,
      orgId: share.orgId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        via: 'share_link',
        shareId: share.id,
        bytesReturned: plaintext.byteLength,
      },
    });

    return {
      shareId: share.id,
      fileId: share.file.id,
      filename: share.file.filename,
      contentType: share.file.contentType,
      contentBase64: plaintext.toString('base64'),
    };
  }

  private async requireMembership(userId: string, orgId: string): Promise<{ role: MembershipRole }> {
    const membership = await this.prismaService.membership.findUnique({
      where: {
        userId_orgId: {
          userId,
          orgId,
        },
      },
      select: {
        role: true,
      },
    });
    if (!membership) {
      throw new ForbiddenException('Not authorized for this organization');
    }

    return membership;
  }

  private requireShareManagementPermission(
    actorUserId: string,
    membershipRole: MembershipRole,
    fileOwnerUserId: string,
    shareCreatorUserId: string | null,
  ): void {
    if (membershipRole === MembershipRole.admin) {
      return;
    }

    if (fileOwnerUserId === actorUserId) {
      return;
    }

    if (shareCreatorUserId && shareCreatorUserId === actorUserId) {
      return;
    }

    throw new ForbiddenException('Not authorized to manage this share');
  }

  private parseShareExpiry(raw: string): Date {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new UnprocessableEntityException('expiresAt must be a valid ISO-8601 timestamp');
    }

    if (parsed.getTime() <= Date.now()) {
      throw new UnprocessableEntityException('expiresAt must be in the future');
    }

    return parsed;
  }

  private async verifyPassword(encodedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(encodedHash, password);
    } catch {
      return false;
    }
  }

  private generateShareToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashShareToken(shareToken: string): string {
    return createHash('sha256').update(shareToken).digest('hex');
  }

  private async denyShareAccess(
    shareId: string,
    orgId: string,
    reason: string,
    context: RequestContext,
  ): Promise<never> {
    await this.auditService.recordEvent({
      action: 'share.access',
      resourceType: 'share',
      resourceId: shareId,
      result: AuditResult.denied,
      actorType: AuditActorType.share_link,
      orgId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        reason,
      },
    });
    throw new ForbiddenException('Invalid or expired share token');
  }

  private async enforcePolicy(input: PolicyDecisionInput): Promise<void> {
    await this.policyService.assertAllowed(input);
  }

  private async enforceShareCreateDlp(
    file: {
      id: string;
      orgId: string;
      filename: string;
      contentType: string;
      derivedText?: string;
    },
    user: AuthenticatedUser,
    context: RequestContext,
    overrideRequest: {
      reason?: string;
      ticket?: string;
    },
  ): Promise<{ policyId: string; verdict: string; matches: string[]; overrideApplied: boolean }> {
    const decision = this.dlpService.evaluateShare({
      filename: file.filename,
      contentType: file.contentType,
      derivedText: file.derivedText,
    });

    if (decision.verdict !== 'deny') {
      return {
        policyId: decision.policyId,
        verdict: decision.verdict,
        matches: decision.matches,
        overrideApplied: false,
      };
    }

    const overrideEvaluation = this.dlpService.evaluateAdminOverride({
      role: user.role,
      decision,
      overrideReason: overrideRequest.reason,
      overrideTicket: overrideRequest.ticket,
    });
    if (!overrideEvaluation.allowed) {
      await this.auditService.recordEvent({
        action: 'share.create.dlp.blocked',
        resourceType: 'share',
        resourceId: null,
        result: AuditResult.denied,
        actorType: AuditActorType.user,
        actorUserId: user.sub,
        orgId: file.orgId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: this.buildDlpMetadata(decision, 'block', {
          overrideReason: overrideRequest.reason,
          overrideTicket: overrideRequest.ticket,
          overrideEvaluationReason: overrideEvaluation.reason,
        }),
      });
      throw new ForbiddenException('Share blocked by DLP policy');
    }

    await this.auditService.recordEvent({
      action: 'share.create.dlp.override',
      resourceType: 'share',
      resourceId: null,
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.sub,
      orgId: file.orgId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: this.buildDlpMetadata(decision, 'override_allow', {
        overrideReason: overrideRequest.reason,
        overrideTicket: overrideRequest.ticket,
        overrideEvaluationReason: overrideEvaluation.reason,
      }),
    });

    return {
      policyId: decision.policyId,
      verdict: decision.verdict,
      matches: decision.matches,
      overrideApplied: true,
    };
  }

  private buildDlpMetadata(
    decision: DlpDecision,
    enforcementAction: 'block' | 'override_allow',
    override: {
      overrideReason?: string;
      overrideTicket?: string;
      overrideEvaluationReason?: string;
    },
  ): {
    policyId: string;
    verdict: string;
    enforcementAction: string;
    matches: string[];
    overridable: boolean;
    reason: string;
    overrideReason: string | null;
    overrideTicket: string | null;
    overrideEvaluationReason: string | null;
  } {
    const normalizedReason = (override.overrideReason ?? '').trim();
    const normalizedTicket = (override.overrideTicket ?? '').trim();

    return {
      policyId: decision.policyId,
      verdict: decision.verdict,
      enforcementAction,
      matches: decision.matches,
      overridable: decision.overridable,
      reason: decision.reason,
      overrideReason: normalizedReason.length > 0 ? normalizedReason : null,
      overrideTicket: normalizedTicket.length > 0 ? normalizedTicket : null,
      overrideEvaluationReason: override.overrideEvaluationReason ?? null,
    };
  }
}
