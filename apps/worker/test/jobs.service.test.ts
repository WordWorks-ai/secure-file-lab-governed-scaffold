import { AuditResult, FileStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JobsService } from '../src/modules/jobs/jobs.service.js';

type InMemoryFile = {
  id: string;
  orgId: string;
  ownerUserId: string;
  filename: string;
  contentType: string;
  sizeBytes: bigint;
  storageKey: string;
  status: FileStatus;
  wrappedDek: string | null;
  encryptionAlg: string | null;
  encryptionIv: string | null;
  encryptionTag: string | null;
  scanResult: string | null;
  scanCompletedAt: Date | null;
  expiresAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type FileFindUniqueArgs = {
  where: { id: string };
  select?: { status?: true };
};

type FileFindManyArgs = {
  where: {
    status?: FileStatus;
    expiresAt?: { lte: Date };
  };
  select: { id: true; orgId: true; status: true };
};

type FileUpdateArgs = {
  where: { id: string };
  data: {
    status?: FileStatus;
    scanResult?: string | null;
    scanCompletedAt?: Date | null;
    deletedAt?: Date | null;
    updatedAt?: Date;
  };
};

class InMemoryPrismaService {
  private readonly filesById = new Map<string, InMemoryFile>();

  readonly file = {
    findUnique: async (args: FileFindUniqueArgs) => {
      const file = this.filesById.get(args.where.id);
      if (!file) {
        return null;
      }

      if (args.select?.status) {
        return { status: file.status };
      }

      return this.cloneFile(file);
    },

    findMany: async (args: FileFindManyArgs) => {
      return [...this.filesById.values()]
        .filter((row) => {
          if (args.where.status && row.status !== args.where.status) {
            return false;
          }

          if (args.where.expiresAt?.lte) {
            if (!row.expiresAt) {
              return false;
            }

            if (row.expiresAt.getTime() > args.where.expiresAt.lte.getTime()) {
              return false;
            }
          }

          return true;
        })
        .map((row) => ({
          id: row.id,
          orgId: row.orgId,
          status: row.status,
        }));
    },

    update: async (args: FileUpdateArgs) => {
      const file = this.filesById.get(args.where.id);
      if (!file) {
        throw new Error(`file not found: ${args.where.id}`);
      }

      if (args.data.status !== undefined) {
        file.status = args.data.status;
      }
      if (args.data.scanResult !== undefined) {
        file.scanResult = args.data.scanResult;
      }
      if (args.data.scanCompletedAt !== undefined) {
        file.scanCompletedAt = args.data.scanCompletedAt;
      }
      if (args.data.deletedAt !== undefined) {
        file.deletedAt = args.data.deletedAt;
      }
      file.updatedAt = args.data.updatedAt ?? new Date();

      return this.cloneFile(file);
    },
  };

  seedFile(overrides: Partial<InMemoryFile> = {}): InMemoryFile {
    const now = new Date();
    const row: InMemoryFile = {
      id: randomUUID(),
      orgId: randomUUID(),
      ownerUserId: randomUUID(),
      filename: 'payload.txt',
      contentType: 'text/plain',
      sizeBytes: BigInt(32),
      storageKey: `files/${randomUUID()}`,
      status: FileStatus.scan_pending,
      wrappedDek: 'wrapped-dek',
      encryptionAlg: 'aes-256-gcm',
      encryptionIv: Buffer.alloc(12, 1).toString('base64'),
      encryptionTag: Buffer.alloc(16, 2).toString('base64'),
      scanResult: null,
      scanCompletedAt: null,
      expiresAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    this.filesById.set(row.id, this.cloneFile(row));
    return this.cloneFile(row);
  }

  getFile(fileId: string): InMemoryFile | undefined {
    const row = this.filesById.get(fileId);
    return row ? this.cloneFile(row) : undefined;
  }

  private cloneFile(row: InMemoryFile): InMemoryFile {
    return {
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      scanCompletedAt: row.scanCompletedAt ? new Date(row.scanCompletedAt) : null,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
      deletedAt: row.deletedAt ? new Date(row.deletedAt) : null,
    };
  }
}

type RecordedAuditEvent = {
  action: string;
  result: AuditResult;
  resourceId?: string | null;
};

class InMemoryAuditService {
  readonly events: RecordedAuditEvent[] = [];
  readonly recordEvent = vi.fn(async (event: RecordedAuditEvent) => {
    this.events.push({ ...event });
  });
}

function createJobsServiceHarness() {
  const prisma = new InMemoryPrismaService();
  const audit = new InMemoryAuditService();
  const scanner = {
    scanBuffer: vi.fn(async (): Promise<'clean' | 'infected'> => 'clean'),
  };
  const fileCrypto = {
    decrypt: vi.fn(() => Buffer.from('decrypted-payload', 'utf8')),
  };
  const objectStorage = {
    getObject: vi.fn(async () => Buffer.from('encrypted-object')),
  };
  const openSearch = {
    isEnabled: vi.fn(() => false),
    ensureIndex: vi.fn(async () => {}),
    upsertFile: vi.fn(async () => {}),
    deleteFile: vi.fn(async () => {}),
  };
  const vaultTransit = {
    unwrapDek: vi.fn(async () => Buffer.alloc(32, 7)),
  };

  const service = new JobsService(
    prisma as unknown as ConstructorParameters<typeof JobsService>[0],
    audit as unknown as ConstructorParameters<typeof JobsService>[1],
    scanner as unknown as ConstructorParameters<typeof JobsService>[2],
    fileCrypto as unknown as ConstructorParameters<typeof JobsService>[3],
    objectStorage as unknown as ConstructorParameters<typeof JobsService>[4],
    openSearch as unknown as ConstructorParameters<typeof JobsService>[5],
    vaultTransit as unknown as ConstructorParameters<typeof JobsService>[6],
  );

  return {
    service,
    prisma,
    audit,
    scanner,
    fileCrypto,
    objectStorage,
    openSearch,
    vaultTransit,
  };
}

describe('JobsService', () => {
  let originalRetentionSeconds: string | undefined;

  beforeEach(() => {
    originalRetentionSeconds = process.env.FILE_EXPIRED_RETENTION_SECONDS;
  });

  afterEach(() => {
    if (originalRetentionSeconds === undefined) {
      delete process.env.FILE_EXPIRED_RETENTION_SECONDS;
    } else {
      process.env.FILE_EXPIRED_RETENTION_SECONDS = originalRetentionSeconds;
    }
  });

  it('transitions scan_pending file to active on clean scan result', async () => {
    const harness = createJobsServiceHarness();
    const file = harness.prisma.seedFile();

    harness.scanner.scanBuffer.mockResolvedValue('clean');

    await harness.service.processFileScanJobPayload({ fileId: file.id }, 0, 3);

    const updated = harness.prisma.getFile(file.id);
    expect(updated?.status).toBe(FileStatus.active);
    expect(updated?.scanResult).toBe('clean');
    expect(harness.objectStorage.getObject).toHaveBeenCalledWith(file.storageKey);
    expect(harness.vaultTransit.unwrapDek).toHaveBeenCalledWith(file.wrappedDek);
    expect(harness.scanner.scanBuffer).toHaveBeenCalledWith(Buffer.from('decrypted-payload', 'utf8'));
    expect(
      harness.audit.events.some(
        (event) =>
          event.action === 'file.scan.completed' &&
          event.result === AuditResult.success &&
          event.resourceId === file.id,
      ),
    ).toBe(true);
  });

  it('transitions scan_pending file to blocked on infected scan result', async () => {
    const harness = createJobsServiceHarness();
    const file = harness.prisma.seedFile();

    harness.scanner.scanBuffer.mockResolvedValue('infected');

    await harness.service.processFileScanJobPayload({ fileId: file.id }, 0, 3);

    const updated = harness.prisma.getFile(file.id);
    expect(updated?.status).toBe(FileStatus.blocked);
    expect(updated?.scanResult).toBe('infected');
    expect(
      harness.audit.events.some(
        (event) =>
          event.action === 'file.scan.completed' &&
          event.result === AuditResult.denied &&
          event.resourceId === file.id,
      ),
    ).toBe(true);
  });

  it('is idempotent for files that are no longer scan_pending', async () => {
    const harness = createJobsServiceHarness();
    const file = harness.prisma.seedFile({
      status: FileStatus.active,
      wrappedDek: null,
      encryptionIv: null,
      encryptionTag: null,
    });

    await harness.service.processFileScanJobPayload({ fileId: file.id }, 0, 3);

    const updated = harness.prisma.getFile(file.id);
    expect(updated?.status).toBe(FileStatus.active);
    expect(harness.objectStorage.getObject).not.toHaveBeenCalled();
    expect(harness.scanner.scanBuffer).not.toHaveBeenCalled();
    expect(harness.audit.events).toHaveLength(0);
  });

  it('throws on non-terminal scan failure to allow queue retry', async () => {
    const harness = createJobsServiceHarness();
    const file = harness.prisma.seedFile();

    harness.scanner.scanBuffer.mockRejectedValue(new Error('clamav unavailable'));

    await expect(
      harness.service.processFileScanJobPayload({ fileId: file.id }, 0, 3),
    ).rejects.toThrow('clamav unavailable');

    const updated = harness.prisma.getFile(file.id);
    expect(updated?.status).toBe(FileStatus.scan_pending);
    expect(harness.audit.events).toHaveLength(0);
  });

  it('blocks file when final scan attempt fails', async () => {
    const harness = createJobsServiceHarness();
    const file = harness.prisma.seedFile();

    harness.scanner.scanBuffer.mockRejectedValue(new Error('clamav unavailable'));

    await harness.service.processFileScanJobPayload({ fileId: file.id }, 2, 3);

    const updated = harness.prisma.getFile(file.id);
    expect(updated?.status).toBe(FileStatus.blocked);
    expect(updated?.scanResult).toContain('scan_error:clamav unavailable');
    expect(
      harness.audit.events.some(
        (event) =>
          event.action === 'file.scan.completed' &&
          event.result === AuditResult.denied &&
          event.resourceId === file.id,
      ),
    ).toBe(true);
  });

  it('expires only active files that have reached expiry', async () => {
    const harness = createJobsServiceHarness();
    const due = harness.prisma.seedFile({
      status: FileStatus.active,
      expiresAt: new Date(Date.now() - 5_000),
    });
    harness.prisma.seedFile({
      status: FileStatus.active,
      expiresAt: new Date(Date.now() + 60_000),
    });
    harness.prisma.seedFile({
      status: FileStatus.blocked,
      expiresAt: new Date(Date.now() - 5_000),
    });

    const transitioned = await harness.service.runExpirationSweep();

    expect(transitioned).toBe(1);
    const dueFile = harness.prisma.getFile(due.id);
    expect(dueFile?.status).toBe(FileStatus.expired);
    expect(
      harness.audit.events.some(
        (event) =>
          event.action === 'file.lifecycle.expired' &&
          event.result === AuditResult.success &&
          event.resourceId === due.id,
      ),
    ).toBe(true);
  });

  it('deletes expired files after retention cutoff', async () => {
    process.env.FILE_EXPIRED_RETENTION_SECONDS = '60';
    const harness = createJobsServiceHarness();

    const oldExpired = harness.prisma.seedFile({
      status: FileStatus.expired,
      expiresAt: new Date(Date.now() - 120_000),
    });
    harness.prisma.seedFile({
      status: FileStatus.expired,
      expiresAt: new Date(Date.now() - 30_000),
    });

    const transitioned = await harness.service.runCleanupSweep();

    expect(transitioned).toBe(1);
    const deleted = harness.prisma.getFile(oldExpired.id);
    expect(deleted?.status).toBe(FileStatus.deleted);
    expect(deleted?.deletedAt).not.toBeNull();
    expect(
      harness.audit.events.some(
        (event) =>
          event.action === 'file.lifecycle.deleted' &&
          event.result === AuditResult.success &&
          event.resourceId === oldExpired.id,
      ),
    ).toBe(true);
  });
});
