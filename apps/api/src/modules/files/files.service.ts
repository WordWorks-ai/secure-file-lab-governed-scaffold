import {
  AuditActorType,
  AuditResult,
  FileStatus,
  MembershipRole,
  Prisma,
  UserRole,
} from '@prisma/client';
import {
  ForbiddenException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AuditService } from '../audit/audit.service.js';
import { AuthenticatedUser } from '../auth/types/authenticated-request.js';
import { DlpDecision, DlpService } from '../dlp/dlp.service.js';
import { PrismaService } from '../persistence/prisma.service.js';
import { PolicyService } from '../policy/policy.service.js';
import { PolicyDecisionInput } from '../policy/policy.types.js';
import { SearchQueueService } from '../search/search-queue.service.js';
import { ContentQueueService } from './content-queue.service.js';
import { UploadFileDto } from './dto/upload-file.dto.js';
import { FileCryptoService } from './file-crypto.service.js';
import {
  isFileDownloadAllowed,
  requireFileStatusTransition,
} from './file-lifecycle-rules.js';
import { FileQueueService } from './file-queue.service.js';
import { MinioObjectStorageService } from './minio-object-storage.service.js';
import { VaultTransitService } from './vault-transit.service.js';

type RequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

@Injectable()
export class FilesService {
  private readonly maxFileBytes = this.getMaxFileBytes();
  private readonly allowedMimeTypes = this.getAllowedMimeTypes();

  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PolicyService) private readonly policyService: PolicyService,
    @Inject(DlpService) private readonly dlpService: DlpService,
    @Inject(SearchQueueService) private readonly searchQueueService: SearchQueueService,
    @Inject(ContentQueueService) private readonly contentQueueService: ContentQueueService,
    @Inject(FileCryptoService) private readonly fileCryptoService: FileCryptoService,
    @Inject(FileQueueService) private readonly fileQueueService: FileQueueService,
    @Inject(MinioObjectStorageService)
    private readonly objectStorageService: MinioObjectStorageService,
    @Inject(VaultTransitService)
    private readonly vaultTransitService: VaultTransitService,
  ) {}

  async uploadFile(
    payload: UploadFileDto,
    user: AuthenticatedUser,
    context: RequestContext,
  ): Promise<{ fileId: string; status: FileStatus; storageKey: string }> {
    const normalizedContentType = payload.contentType.trim().toLowerCase();
    const normalizedFilename = payload.filename.trim();
    this.assertMimeTypeAllowed(normalizedContentType);
    const plaintext = this.decodeBase64Payload(payload.contentBase64);
    this.assertPayloadSizeWithinLimit(plaintext.byteLength);

    const org = await this.ensurePrimaryOrg(user);
    await this.enforcePolicy({
      action: 'file.upload',
      actor: {
        type: 'user',
        id: user.sub,
        role: user.role,
        email: user.email,
      },
      resource: {
        type: 'org',
        id: org.id,
        orgId: org.id,
      },
      context: {
        contentType: normalizedContentType,
        sizeBytes: plaintext.byteLength,
      },
    });

    const dlpDecision = this.dlpService.evaluateUpload({
      filename: normalizedFilename,
      contentType: normalizedContentType,
      plaintext,
    });
    const dlpOverrideApplied = await this.enforceUploadDlp(dlpDecision, user, org.id, context, {
      reason: payload.dlpOverrideReason,
      ticket: payload.dlpOverrideTicket,
    });

    const storageKey = `files/${org.id}/${randomUUID()}`;
    const now = new Date();
    const expiresAt = this.parseOptionalExpiry(payload.expiresAt);
    const created = await this.prismaService.file.create({
      data: {
        orgId: org.id,
        ownerUserId: user.sub,
        filename: normalizedFilename,
        contentType: normalizedContentType,
        sizeBytes: BigInt(plaintext.byteLength),
        storageKey,
        status: FileStatus.created,
        expiresAt,
      },
    });

    await this.auditService.recordEvent({
      action: 'file.upload.initiated',
      resourceType: 'file',
      resourceId: created.id,
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.sub,
      orgId: org.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        filename: created.filename,
        contentType: created.contentType,
        sizeBytes: plaintext.byteLength,
        dlpPolicyId: dlpDecision.policyId,
        dlpVerdict: dlpOverrideApplied ? 'override_allow' : dlpDecision.verdict,
        dlpMatches: dlpDecision.matches,
      },
    });

    const dek = this.fileCryptoService.generateDek();
    const encrypted = this.fileCryptoService.encrypt(plaintext, dek);
    const wrappedDek = await this.vaultTransitService.wrapDek(dek);
    await this.objectStorageService.putObject(storageKey, encrypted.ciphertext, 'application/octet-stream');

    const stored = await this.transitionFileStatus(created.id, created.status, FileStatus.stored, {
      wrappedDek,
      encryptionAlg: 'aes-256-gcm',
      encryptionIv: encrypted.iv.toString('base64'),
      encryptionTag: encrypted.tag.toString('base64'),
      scanResult: null,
      scanCompletedAt: null,
      updatedAt: now,
    });

    await this.auditService.recordEvent({
      action: 'file.encryption.persisted',
      resourceType: 'file',
      resourceId: created.id,
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.sub,
      orgId: org.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        storageKey,
        encryptionAlg: 'aes-256-gcm',
      },
    });

    const quarantined = await this.transitionFileStatus(
      stored.id,
      stored.status,
      FileStatus.quarantined,
      {
        updatedAt: now,
      },
    );
    const scanPending = await this.transitionFileStatus(
      quarantined.id,
      quarantined.status,
      FileStatus.scan_pending,
      {
        updatedAt: now,
      },
    );

    await this.auditService.recordEvent({
      action: 'file.scan.queued',
      resourceType: 'file',
      resourceId: scanPending.id,
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.sub,
      orgId: org.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    try {
      await this.fileQueueService.enqueueScan(scanPending.id);
    } catch (error: unknown) {
      await this.auditService.recordEvent({
        action: 'file.scan.queue_failed',
        resourceType: 'file',
        resourceId: scanPending.id,
        result: AuditResult.failure,
        actorType: AuditActorType.system,
        actorUserId: null,
        orgId: org.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          reason: error instanceof Error ? error.message : 'unknown_queue_error',
        },
      });
    }

    await this.tryEnqueueSearchUpsert(scanPending.id);

    return {
      fileId: scanPending.id,
      status: scanPending.status,
      storageKey: scanPending.storageKey,
    };
  }

  async activateFile(
    fileId: string,
    user: AuthenticatedUser,
    context: RequestContext,
  ): Promise<{ fileId: string; status: FileStatus }> {
    const file = await this.findFileForUser(fileId, user);
    await this.enforcePolicy({
      action: 'file.activate',
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
    });
    const activated = await this.transitionFileStatus(file.id, file.status, FileStatus.active, {
      scanResult: 'clean',
      scanCompletedAt: new Date(),
      updatedAt: new Date(),
    });

    await this.auditService.recordEvent({
      action: 'file.scan.completed',
      resourceType: 'file',
      resourceId: activated.id,
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.sub,
      orgId: activated.orgId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        status: activated.status,
        simulatedByRole: user.role,
      },
    });

    await this.tryEnqueueSearchUpsert(activated.id);
    await this.tryEnqueueContentProcessing(activated.id);

    return {
      fileId: activated.id,
      status: activated.status,
    };
  }

  async getFileArtifacts(
    fileId: string,
    user: AuthenticatedUser,
  ): Promise<{
    fileId: string;
    preview: {
      available: boolean;
      text: string | null;
      generatedAt: string | null;
    };
    ocr: {
      available: boolean;
      text: string | null;
      generatedAt: string | null;
    };
  }> {
    await this.findFileForUser(fileId, user);

    const artifact = await this.prismaService.fileArtifact.findUnique({
      where: {
        fileId,
      },
      select: {
        previewText: true,
        previewGeneratedAt: true,
        ocrText: true,
        ocrGeneratedAt: true,
      },
    });

    return {
      fileId,
      preview: {
        available: Boolean(artifact?.previewText),
        text: artifact?.previewText ?? null,
        generatedAt: artifact?.previewGeneratedAt ? artifact.previewGeneratedAt.toISOString() : null,
      },
      ocr: {
        available: Boolean(artifact?.ocrText),
        text: artifact?.ocrText ?? null,
        generatedAt: artifact?.ocrGeneratedAt ? artifact.ocrGeneratedAt.toISOString() : null,
      },
    };
  }

  async getFileMetadata(
    fileId: string,
    user: AuthenticatedUser,
  ): Promise<{
    id: string;
    filename: string;
    contentType: string;
    sizeBytes: string;
    status: FileStatus;
    createdAt: string;
    updatedAt: string;
  }> {
    const file = await this.findFileForUser(fileId, user);
    return {
      id: file.id,
      filename: file.filename,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes.toString(),
      status: file.status,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    };
  }

  async downloadFile(
    fileId: string,
    user: AuthenticatedUser,
    context: RequestContext,
  ): Promise<{
    fileId: string;
    filename: string;
    contentType: string;
    contentBase64: string;
  }> {
    const file = await this.findFileForUser(fileId, user);
    await this.enforcePolicy({
      action: 'file.download',
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
        status: file.status,
      },
    });

    if (!isFileDownloadAllowed(file.status)) {
      await this.auditService.recordEvent({
        action: 'file.download.attempt',
        resourceType: 'file',
        resourceId: file.id,
        result: AuditResult.denied,
        actorType: AuditActorType.user,
        actorUserId: user.sub,
        orgId: file.orgId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          reason: 'file_not_active',
          status: file.status,
        },
      });
      throw new ForbiddenException('File is not available for download');
    }

    if (!file.wrappedDek || !file.encryptionIv || !file.encryptionTag) {
      throw new UnprocessableEntityException('File encryption metadata is incomplete');
    }

    const ciphertext = await this.objectStorageService.getObject(file.storageKey);
    const dek = await this.vaultTransitService.unwrapDek(file.wrappedDek);
    const plaintext = this.fileCryptoService.decrypt(
      ciphertext,
      dek,
      Buffer.from(file.encryptionIv, 'base64'),
      Buffer.from(file.encryptionTag, 'base64'),
    );

    await this.auditService.recordEvent({
      action: 'file.download.attempt',
      resourceType: 'file',
      resourceId: file.id,
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.sub,
      orgId: file.orgId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        status: file.status,
        bytesReturned: plaintext.byteLength,
      },
    });

    return {
      fileId: file.id,
      filename: file.filename,
      contentType: file.contentType,
      contentBase64: plaintext.toString('base64'),
    };
  }

  private async findFileForUser(fileId: string, user: AuthenticatedUser) {
    const file = await this.prismaService.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new ForbiddenException('File not found');
    }

    const membership = await this.prismaService.membership.findUnique({
      where: {
        userId_orgId: {
          userId: user.sub,
          orgId: file.orgId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Not authorized to access this file');
    }

    return file;
  }

  private async ensurePrimaryOrg(user: AuthenticatedUser): Promise<{ id: string }> {
    const userRecord = await this.prismaService.user.findUnique({ where: { id: user.sub } });
    if (!userRecord) {
      throw new ForbiddenException('Authenticated user does not exist');
    }

    const existingMembership = await this.prismaService.membership.findFirst({
      where: { userId: user.sub },
      orderBy: { createdAt: 'asc' },
      select: {
        orgId: true,
      },
    });
    if (existingMembership) {
      return { id: existingMembership.orgId };
    }

    const org = await this.prismaService.org.create({
      data: {
        name: `${userRecord.email} workspace`,
        slug: `org-${randomUUID().slice(0, 12)}`,
      },
      select: { id: true },
    });

    await this.prismaService.membership.create({
      data: {
        userId: user.sub,
        orgId: org.id,
        role: user.role === UserRole.admin ? MembershipRole.admin : MembershipRole.member,
      },
    });

    return org;
  }

  private async transitionFileStatus(
    fileId: string,
    from: FileStatus,
    to: FileStatus,
    data: Omit<Prisma.FileUpdateInput, 'status'> = {},
  ) {
    requireFileStatusTransition(from, to);
    return this.prismaService.file.update({
      where: { id: fileId },
      data: {
        ...data,
        status: to,
      },
    });
  }

  private decodeBase64Payload(contentBase64: string): Buffer {
    try {
      const normalized = contentBase64.replace(/\s+/g, '');
      return Buffer.from(normalized, 'base64');
    } catch {
      throw new UnprocessableEntityException('Invalid base64 payload');
    }
  }

  private assertPayloadSizeWithinLimit(byteLength: number): void {
    if (byteLength <= 0) {
      throw new UnprocessableEntityException('File payload must not be empty');
    }

    if (byteLength > this.maxFileBytes) {
      throw new PayloadTooLargeException(`File exceeds maximum allowed size (${this.maxFileBytes} bytes)`);
    }
  }

  private assertMimeTypeAllowed(contentType: string): void {
    if (!this.allowedMimeTypes.has(contentType)) {
      throw new UnprocessableEntityException(`Unsupported content type: ${contentType}`);
    }
  }

  private parseOptionalExpiry(value: string | undefined): Date | null {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new UnprocessableEntityException('expiresAt must be a valid ISO-8601 timestamp');
    }

    return parsed;
  }

  private getMaxFileBytes(): number {
    const raw = Number(process.env.FILE_UPLOAD_MAX_BYTES ?? 5_242_880);
    if (Number.isFinite(raw) && raw > 0) {
      return Math.floor(raw);
    }

    return 5_242_880;
  }

  private getAllowedMimeTypes(): Set<string> {
    const raw = process.env.FILE_UPLOAD_ALLOWED_MIME_TYPES;
    if (!raw) {
      return new Set([
        'text/plain',
        'application/pdf',
        'image/png',
        'image/jpeg',
        'application/json',
      ]);
    }

    const values = raw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);
    if (values.length === 0) {
      return new Set(['text/plain']);
    }

    return new Set(values);
  }

  private async enforcePolicy(input: PolicyDecisionInput): Promise<void> {
    await this.policyService.assertAllowed(input);
  }

  private async tryEnqueueSearchUpsert(fileId: string): Promise<void> {
    try {
      await this.searchQueueService.enqueue('upsert', fileId);
    } catch {
      // Search indexing must not block core file workflow.
    }
  }

  private async tryEnqueueContentProcessing(fileId: string): Promise<void> {
    try {
      await this.contentQueueService.enqueue(fileId);
    } catch {
      // Content derivation must not block core file workflow.
    }
  }

  private async enforceUploadDlp(
    decision: DlpDecision,
    user: AuthenticatedUser,
    orgId: string,
    context: RequestContext,
    overrideRequest: {
      reason?: string;
      ticket?: string;
    },
  ): Promise<boolean> {
    if (decision.verdict !== 'deny') {
      return false;
    }

    const overrideEvaluation = this.dlpService.evaluateAdminOverride({
      role: user.role,
      decision,
      overrideReason: overrideRequest.reason,
      overrideTicket: overrideRequest.ticket,
    });
    if (!overrideEvaluation.allowed) {
      await this.auditService.recordEvent({
        action: 'file.upload.dlp.blocked',
        resourceType: 'file',
        resourceId: null,
        result: AuditResult.denied,
        actorType: AuditActorType.user,
        actorUserId: user.sub,
        orgId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: this.buildDlpMetadata(decision, decision.enforcementAction, {
          overrideReason: overrideRequest.reason,
          overrideTicket: overrideRequest.ticket,
          overrideEvaluationReason: overrideEvaluation.reason,
        }),
      });
      throw new ForbiddenException('Upload blocked by DLP policy');
    }

    await this.auditService.recordEvent({
      action: 'file.upload.dlp.override',
      resourceType: 'file',
      resourceId: null,
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.sub,
      orgId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: this.buildDlpMetadata(decision, 'override_allow', {
        overrideReason: overrideRequest.reason,
        overrideTicket: overrideRequest.ticket,
        overrideEvaluationReason: overrideEvaluation.reason,
      }),
    });

    return true;
  }

  private buildDlpMetadata(
    decision: DlpDecision,
    enforcementAction: 'allow' | 'block' | 'override_allow',
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
