import { AuditActorType, AuditResult, FileStatus } from '@prisma/client';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../persistence/prisma.service.js';
import {
  CLEANUP_FILES_JOB_NAME,
  EXPIRE_FILES_JOB_NAME,
  FILE_SCAN_QUEUE_NAME,
  FileScanJobPayload,
  MAINTENANCE_QUEUE_NAME,
} from './contracts/file-jobs.contract.js';
import {
  CONTENT_PROCESS_JOB_NAME,
  CONTENT_PROCESS_QUEUE_NAME,
  ContentProcessJobPayload,
} from './contracts/content-jobs.contract.js';
import {
  SEARCH_INDEX_JOB_NAME,
  SEARCH_INDEX_QUEUE_NAME,
  SearchIndexJobPayload,
} from './contracts/search-index-jobs.contract.js';
import { ClamavScannerService } from './services/clamav-scanner.service.js';
import { WorkerContentDerivativesService } from './services/worker-content-derivatives.service.js';
import { WorkerFileCryptoService } from './services/worker-file-crypto.service.js';
import { WorkerMinioObjectStorageService } from './services/worker-minio-object-storage.service.js';
import { WorkerOpenSearchIndexService } from './services/worker-opensearch-index.service.js';
import { WorkerVaultTransitService } from './services/worker-vault-transit.service.js';

const ALLOWED_TRANSITIONS: Record<FileStatus, FileStatus[]> = {
  created: ['stored', 'deleted'],
  stored: ['quarantined', 'deleted'],
  quarantined: ['scan_pending', 'blocked', 'deleted'],
  scan_pending: ['active', 'blocked', 'deleted'],
  active: ['blocked', 'expired', 'deleted'],
  blocked: ['deleted'],
  expired: ['deleted'],
  deleted: [],
};

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private connection: Redis | null = null;
  private fileScanQueue: Queue<FileScanJobPayload> | null = null;
  private maintenanceQueue: Queue<Record<string, never>> | null = null;
  private contentProcessQueue: Queue<ContentProcessJobPayload> | null = null;
  private searchIndexQueue: Queue<SearchIndexJobPayload> | null = null;
  private fileScanWorker: Worker<FileScanJobPayload> | null = null;
  private maintenanceWorker: Worker<Record<string, never>> | null = null;
  private contentProcessWorker: Worker<ContentProcessJobPayload> | null = null;
  private searchIndexWorker: Worker<SearchIndexJobPayload> | null = null;

  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(ClamavScannerService) private readonly clamavScannerService: ClamavScannerService,
    @Inject(WorkerContentDerivativesService)
    private readonly contentDerivativesService: WorkerContentDerivativesService,
    @Inject(WorkerFileCryptoService) private readonly fileCryptoService: WorkerFileCryptoService,
    @Inject(WorkerMinioObjectStorageService)
    private readonly objectStorageService: WorkerMinioObjectStorageService,
    @Inject(WorkerOpenSearchIndexService)
    private readonly openSearchIndexService: WorkerOpenSearchIndexService,
    @Inject(WorkerVaultTransitService)
    private readonly vaultTransitService: WorkerVaultTransitService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.WORKER_QUEUE_BOOT_DISABLED === 'true') {
      this.logger.warn('Worker queue boot disabled by WORKER_QUEUE_BOOT_DISABLED=true');
      return;
    }

    const connection = new Redis(this.getRedisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    this.connection = connection;
    this.fileScanQueue = new Queue(FILE_SCAN_QUEUE_NAME, {
      connection,
    });
    this.maintenanceQueue = new Queue(MAINTENANCE_QUEUE_NAME, {
      connection,
    });
    if (this.isContentPipelineEnabled()) {
      this.contentProcessQueue = new Queue(CONTENT_PROCESS_QUEUE_NAME, {
        connection,
      });
    }
    if (this.openSearchIndexService.isEnabled()) {
      this.searchIndexQueue = new Queue(SEARCH_INDEX_QUEUE_NAME, {
        connection,
      });
      await this.openSearchIndexService.ensureIndex();
    }

    this.fileScanWorker = new Worker(
      FILE_SCAN_QUEUE_NAME,
      async (job) => {
        await this.processFileScanJobPayload(
          job.data,
          job.attemptsMade,
          this.getJobAttemptsFromJob(job, this.getScanAttempts()),
        );
      },
      {
        connection,
        concurrency: this.getScanConcurrency(),
      },
    );
    this.maintenanceWorker = new Worker(
      MAINTENANCE_QUEUE_NAME,
      async (job) => {
        if (job.name === EXPIRE_FILES_JOB_NAME) {
          await this.runExpirationSweep();
          return;
        }

        if (job.name === CLEANUP_FILES_JOB_NAME) {
          await this.runCleanupSweep();
          return;
        }

        this.logger.warn(`unknown maintenance job "${job.name}" ignored`);
      },
      {
        connection,
        concurrency: 1,
      },
    );
    if (this.contentProcessQueue) {
      this.contentProcessWorker = new Worker(
        CONTENT_PROCESS_QUEUE_NAME,
        async (job) => {
          if (job.name !== CONTENT_PROCESS_JOB_NAME) {
            this.logger.warn(`unknown content job "${job.name}" ignored`);
            return;
          }

          await this.processContentProcessJobPayload(
            job.data,
            job.attemptsMade,
            this.getJobAttemptsFromJob(job, this.getContentJobAttempts()),
          );
        },
        {
          connection,
          concurrency: 2,
        },
      );

      this.contentProcessWorker.on('failed', (job, error) => {
        this.logger.error(
          `content job ${job?.id ?? 'unknown'} failed: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      });
    }
    if (this.searchIndexQueue) {
      this.searchIndexWorker = new Worker(
        SEARCH_INDEX_QUEUE_NAME,
        async (job) => {
          if (job.name !== SEARCH_INDEX_JOB_NAME) {
            this.logger.warn(`unknown search-index job "${job.name}" ignored`);
            return;
          }

          await this.processSearchIndexJobPayload(job.data);
        },
        {
          connection,
          concurrency: 2,
        },
      );

      this.searchIndexWorker.on('failed', (job, error) => {
        this.logger.error(
          `search index job ${job?.id ?? 'unknown'} failed: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      });
    }

    this.fileScanWorker.on('failed', (job, error) => {
      this.logger.error(
        `file scan job ${job?.id ?? 'unknown'} failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    });
    this.maintenanceWorker.on('failed', (job, error) => {
      this.logger.error(
        `maintenance job ${job?.id ?? 'unknown'} failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    });

    await this.scheduleMaintenanceJobs();
    this.logger.log(
      'Worker job processors initialized (file scan + maintenance + content-process + search-index)',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.contentProcessWorker?.close();
    await this.searchIndexWorker?.close();
    await this.fileScanWorker?.close();
    await this.maintenanceWorker?.close();
    await this.contentProcessQueue?.close();
    await this.searchIndexQueue?.close();
    await this.fileScanQueue?.close();
    await this.maintenanceQueue?.close();
    this.connection?.disconnect();
  }

  async processFileScanJobPayload(
    payload: FileScanJobPayload,
    attemptsMade: number,
    maxAttempts: number,
  ): Promise<void> {
    const file = await this.prismaService.file.findUnique({
      where: { id: payload.fileId },
    });
    if (!file) {
      this.logger.warn(`scan job ignored for missing file ${payload.fileId}`);
      return;
    }

    if (file.status !== FileStatus.scan_pending) {
      this.logger.debug(
        `scan job idempotent no-op for file ${file.id} with status ${file.status}`,
      );
      return;
    }

    if (!file.wrappedDek || !file.encryptionIv || !file.encryptionTag) {
      await this.blockFileForFailedScan(file.id, file.orgId, 'missing_encryption_metadata');
      return;
    }

    try {
      const encryptedObject = await this.objectStorageService.getObject(file.storageKey);
      const dek = await this.vaultTransitService.unwrapDek(file.wrappedDek);
      const plaintext = this.fileCryptoService.decrypt(
        encryptedObject,
        dek,
        Buffer.from(file.encryptionIv, 'base64'),
        Buffer.from(file.encryptionTag, 'base64'),
      );
      const scanResult = await this.clamavScannerService.scanBuffer(plaintext);

      if (scanResult === 'clean') {
        await this.transitionFileStatus(file.id, file.status, FileStatus.active, {
          scanResult: 'clean',
          scanCompletedAt: new Date(),
          updatedAt: new Date(),
        });
        await this.auditService.recordEvent({
          action: 'file.scan.completed',
          resourceType: 'file',
          resourceId: file.id,
          result: AuditResult.success,
          actorType: AuditActorType.system,
          orgId: file.orgId,
          metadata: {
            outcome: 'clean',
          },
        });
        await this.enqueueContentProcessing(file.id);
        await this.syncFileToSearch(file.id);
        return;
      }

      await this.blockFileForFailedScan(file.id, file.orgId, 'infected');
    } catch (error: unknown) {
      const nextAttempt = attemptsMade + 1;
      if (nextAttempt < maxAttempts) {
        throw error;
      }

      await this.blockFileForFailedScan(
        file.id,
        file.orgId,
        `scan_error:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  async runExpirationSweep(): Promise<number> {
    const now = new Date();
    const candidates = await this.prismaService.file.findMany({
      where: {
        status: FileStatus.active,
        expiresAt: {
          lte: now,
        },
      },
      select: {
        id: true,
        orgId: true,
        status: true,
      },
    });

    let transitioned = 0;
    for (const candidate of candidates) {
      await this.transitionFileStatus(candidate.id, candidate.status, FileStatus.expired, {
        updatedAt: now,
      });
      transitioned += 1;
      await this.syncFileToSearch(candidate.id);
      await this.auditService.recordEvent({
        action: 'file.lifecycle.expired',
        resourceType: 'file',
        resourceId: candidate.id,
        result: AuditResult.success,
        actorType: AuditActorType.system,
        orgId: candidate.orgId,
      });
    }

    if (transitioned > 0) {
      this.logger.log(`expiration sweep transitioned ${transitioned} files to expired`);
    }

    return transitioned;
  }

  async runCleanupSweep(): Promise<number> {
    const now = new Date();
    const retentionSeconds = this.getExpiredRetentionSeconds();
    const cutoff = new Date(now.getTime() - retentionSeconds * 1000);

    const candidates = await this.prismaService.file.findMany({
      where: {
        status: FileStatus.expired,
        expiresAt: {
          lte: cutoff,
        },
      },
      select: {
        id: true,
        orgId: true,
        status: true,
      },
    });

    let transitioned = 0;
    for (const candidate of candidates) {
      await this.transitionFileStatus(candidate.id, candidate.status, FileStatus.deleted, {
        deletedAt: now,
        updatedAt: now,
      });
      transitioned += 1;
      await this.syncFileToSearch(candidate.id);
      await this.auditService.recordEvent({
        action: 'file.lifecycle.deleted',
        resourceType: 'file',
        resourceId: candidate.id,
        result: AuditResult.success,
        actorType: AuditActorType.system,
        orgId: candidate.orgId,
      });
    }

    if (transitioned > 0) {
      this.logger.log(`cleanup sweep transitioned ${transitioned} expired files to deleted`);
    }

    return transitioned;
  }

  async processContentProcessJobPayload(
    payload: ContentProcessJobPayload,
    attemptsMade: number,
    maxAttempts: number,
  ): Promise<void> {
    if (!this.isContentPipelineEnabled()) {
      return;
    }

    const file = await this.prismaService.file.findUnique({
      where: { id: payload.fileId },
      select: {
        id: true,
        orgId: true,
        storageKey: true,
        contentType: true,
        status: true,
        wrappedDek: true,
        encryptionIv: true,
        encryptionTag: true,
      },
    });

    if (!file) {
      this.logger.warn(`content job ignored for missing file ${payload.fileId}`);
      return;
    }

    if (file.status !== FileStatus.active) {
      this.logger.debug(
        `content job idempotent no-op for file ${file.id} with status ${file.status}`,
      );
      return;
    }

    if (!file.wrappedDek || !file.encryptionIv || !file.encryptionTag) {
      return;
    }

    try {
      const encryptedObject = await this.objectStorageService.getObject(file.storageKey);
      const dek = await this.vaultTransitService.unwrapDek(file.wrappedDek);
      const plaintext = this.fileCryptoService.decrypt(
        encryptedObject,
        dek,
        Buffer.from(file.encryptionIv, 'base64'),
        Buffer.from(file.encryptionTag, 'base64'),
      );

      const previewText = this.contentDerivativesService.generatePreview(file.contentType, plaintext);
      const ocrText = this.contentDerivativesService.extractOcrText(file.contentType, plaintext);
      const now = new Date();

      await this.prismaService.fileArtifact.upsert({
        where: {
          fileId: file.id,
        },
        create: {
          fileId: file.id,
          previewText,
          previewGeneratedAt: now,
          ocrText,
          ocrGeneratedAt: now,
        },
        update: {
          previewText,
          previewGeneratedAt: now,
          ocrText,
          ocrGeneratedAt: now,
        },
      });

      await this.auditService.recordEvent({
        action: 'file.preview.generated',
        resourceType: 'file',
        resourceId: file.id,
        result: AuditResult.success,
        actorType: AuditActorType.system,
        orgId: file.orgId,
      });
      await this.auditService.recordEvent({
        action: 'file.ocr.generated',
        resourceType: 'file',
        resourceId: file.id,
        result: AuditResult.success,
        actorType: AuditActorType.system,
        orgId: file.orgId,
      });
    } catch (error: unknown) {
      const nextAttempt = attemptsMade + 1;
      const failureReason = error instanceof Error ? error.message : 'unknown';
      if (nextAttempt < maxAttempts) {
        await this.auditService.recordEvent({
          action: 'file.content.retry',
          resourceType: 'file',
          resourceId: payload.fileId,
          result: AuditResult.failure,
          actorType: AuditActorType.system,
          orgId: file.orgId,
          metadata: {
            attempt: nextAttempt,
            maxAttempts,
            reason: failureReason,
          },
        });
        throw error;
      }

      await this.auditService.recordEvent({
        action: 'file.content.generated',
        resourceType: 'file',
        resourceId: payload.fileId,
        result: AuditResult.failure,
        actorType: AuditActorType.system,
        orgId: file.orgId,
        metadata: {
          reason: failureReason,
        },
      });

      if (!this.isContentFailClosedEnabled()) {
        return;
      }

      const current = await this.prismaService.file.findUnique({
        where: { id: file.id },
        select: { status: true },
      });

      if (!current || current.status !== FileStatus.active) {
        return;
      }

      await this.transitionFileStatus(file.id, current.status, FileStatus.blocked, {
        scanResult: `content_error:${failureReason}`,
        scanCompletedAt: new Date(),
        updatedAt: new Date(),
      });
      await this.syncFileToSearch(file.id);

      await this.auditService.recordEvent({
        action: 'file.content.blocked',
        resourceType: 'file',
        resourceId: file.id,
        result: AuditResult.denied,
        actorType: AuditActorType.system,
        orgId: file.orgId,
        metadata: {
          reason: failureReason,
          failClosed: true,
        },
      });
    }
  }

  private async blockFileForFailedScan(
    fileId: string,
    orgId: string,
    scanResult: string,
  ): Promise<void> {
    const current = await this.prismaService.file.findUnique({
      where: { id: fileId },
      select: { status: true },
    });

    if (!current || current.status !== FileStatus.scan_pending) {
      return;
    }

    await this.transitionFileStatus(fileId, current.status, FileStatus.blocked, {
      scanResult,
      scanCompletedAt: new Date(),
      updatedAt: new Date(),
    });
    await this.syncFileToSearch(fileId);
    await this.auditService.recordEvent({
      action: 'file.scan.completed',
      resourceType: 'file',
      resourceId: fileId,
      result: AuditResult.denied,
      actorType: AuditActorType.system,
      orgId,
      metadata: {
        outcome: 'blocked',
        scanResult,
      },
    });
  }

  private async processSearchIndexJobPayload(payload: SearchIndexJobPayload): Promise<void> {
    if (payload.action === 'delete') {
      await this.openSearchIndexService.deleteFile(payload.fileId);
      return;
    }

    await this.syncFileToSearch(payload.fileId);
  }

  private async syncFileToSearch(fileId: string): Promise<void> {
    if (!this.openSearchIndexService.isEnabled()) {
      return;
    }

    const file = await this.prismaService.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        filename: true,
        contentType: true,
        status: true,
        orgId: true,
        ownerUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!file || file.status === FileStatus.deleted) {
      await this.openSearchIndexService.deleteFile(fileId);
      return;
    }

    await this.openSearchIndexService.upsertFile({
      id: file.id,
      filename: file.filename,
      contentType: file.contentType,
      status: file.status,
      orgId: file.orgId,
      ownerUserId: file.ownerUserId,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    });
  }

  private async enqueueContentProcessing(fileId: string): Promise<void> {
    if (!this.contentProcessQueue) {
      return;
    }

    await this.contentProcessQueue.add(
      CONTENT_PROCESS_JOB_NAME,
      { fileId },
      {
        jobId: `content:${fileId}`,
        attempts: this.getContentJobAttempts(),
        backoff: {
          type: 'exponential',
          delay: this.getContentJobBackoffDelayMs(),
        },
        removeOnComplete: 1_000,
        removeOnFail: 4_000,
      },
    );
  }

  private async transitionFileStatus(
    fileId: string,
    from: FileStatus,
    to: FileStatus,
    data: {
      scanResult?: string;
      scanCompletedAt?: Date;
      deletedAt?: Date;
      updatedAt: Date;
    },
  ): Promise<void> {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new Error(`Illegal file status transition: ${from} -> ${to}`);
    }

    await this.prismaService.file.update({
      where: { id: fileId },
      data: {
        status: to,
        scanResult: data.scanResult,
        scanCompletedAt: data.scanCompletedAt,
        deletedAt: data.deletedAt,
        updatedAt: data.updatedAt,
      },
    });
  }

  private async scheduleMaintenanceJobs(): Promise<void> {
    if (!this.maintenanceQueue) {
      return;
    }

    await this.maintenanceQueue.add(EXPIRE_FILES_JOB_NAME, {}, {
      jobId: 'maintenance:expire-files',
      repeat: {
        every: this.getExpireSweepIntervalMs(),
      },
      removeOnComplete: 500,
      removeOnFail: 500,
    });

    await this.maintenanceQueue.add(CLEANUP_FILES_JOB_NAME, {}, {
      jobId: 'maintenance:cleanup-files',
      repeat: {
        every: this.getCleanupSweepIntervalMs(),
      },
      removeOnComplete: 500,
      removeOnFail: 500,
    });
  }

  private getJobAttemptsFromJob(job: Job<unknown>, fallback: number): number {
    const attemptsOption = Number(job.opts.attempts ?? fallback);
    if (Number.isFinite(attemptsOption) && attemptsOption >= 1) {
      return Math.floor(attemptsOption);
    }

    return fallback;
  }

  private getRedisUrl(): string {
    return process.env.REDIS_URL ?? 'redis://redis:6379';
  }

  private getScanConcurrency(): number {
    const raw = Number(process.env.WORKER_SCAN_CONCURRENCY ?? 2);
    if (Number.isFinite(raw) && raw >= 1) {
      return Math.floor(raw);
    }

    return 2;
  }

  private getScanAttempts(): number {
    const raw = Number(process.env.FILE_SCAN_JOB_ATTEMPTS ?? 3);
    if (Number.isFinite(raw) && raw >= 1) {
      return Math.floor(raw);
    }

    return 3;
  }

  private getContentJobAttempts(): number {
    const raw = Number(process.env.CONTENT_JOB_ATTEMPTS ?? 3);
    if (Number.isFinite(raw) && raw >= 1) {
      return Math.floor(raw);
    }

    return 3;
  }

  private getContentJobBackoffDelayMs(): number {
    const raw = Number(process.env.CONTENT_JOB_BACKOFF_DELAY_MS ?? 2_000);
    if (Number.isFinite(raw) && raw >= 250) {
      return Math.floor(raw);
    }

    return 2_000;
  }

  private isContentPipelineEnabled(): boolean {
    return (process.env.CONTENT_PIPELINE_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  }

  private isContentFailClosedEnabled(): boolean {
    return (process.env.CONTENT_PIPELINE_FAIL_CLOSED ?? 'true').trim().toLowerCase() !== 'false';
  }

  private getExpireSweepIntervalMs(): number {
    const raw = Number(process.env.WORKER_EXPIRE_SWEEP_MS ?? 60_000);
    if (Number.isFinite(raw) && raw >= 1_000) {
      return Math.floor(raw);
    }

    return 60_000;
  }

  private getCleanupSweepIntervalMs(): number {
    const raw = Number(process.env.WORKER_CLEANUP_SWEEP_MS ?? 300_000);
    if (Number.isFinite(raw) && raw >= 1_000) {
      return Math.floor(raw);
    }

    return 300_000;
  }

  private getExpiredRetentionSeconds(): number {
    const raw = Number(process.env.FILE_EXPIRED_RETENTION_SECONDS ?? 86_400);
    if (Number.isFinite(raw) && raw >= 0) {
      return Math.floor(raw);
    }

    return 86_400;
  }
}
