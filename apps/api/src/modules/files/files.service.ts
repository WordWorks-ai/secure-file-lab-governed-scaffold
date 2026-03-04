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
import { PrismaService } from '../persistence/prisma.service.js';
import { UploadFileDto } from './dto/upload-file.dto.js';
import { FileCryptoService } from './file-crypto.service.js';
import {
  isFileDownloadAllowed,
  requireFileStatusTransition,
} from './file-lifecycle-rules.js';
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
    @Inject(FileCryptoService) private readonly fileCryptoService: FileCryptoService,
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
    this.assertMimeTypeAllowed(normalizedContentType);
    const plaintext = this.decodeBase64Payload(payload.contentBase64);
    this.assertPayloadSizeWithinLimit(plaintext.byteLength);

    const org = await this.ensurePrimaryOrg(user);
    const storageKey = `files/${org.id}/${randomUUID()}`;
    const now = new Date();
    const expiresAt = this.parseOptionalExpiry(payload.expiresAt);
    const created = await this.prismaService.file.create({
      data: {
        orgId: org.id,
        ownerUserId: user.sub,
        filename: payload.filename.trim(),
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

    return {
      fileId: activated.id,
      status: activated.status,
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
}
