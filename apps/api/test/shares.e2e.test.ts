import 'reflect-metadata';

import { AuditActorType, AuditResult, FileStatus, MembershipRole, UserRole } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createCipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApiApplication } from '../src/bootstrap/configure-api-application.js';
import { FileQueueService } from '../src/modules/files/file-queue.service.js';
import { MinioObjectStorageService } from '../src/modules/files/minio-object-storage.service.js';
import { VaultTransitService } from '../src/modules/files/vault-transit.service.js';
import { PrismaService } from '../src/modules/persistence/prisma.service.js';

type InMemoryUser = {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type InMemoryOrg = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
};

type InMemoryMembership = {
  id: string;
  userId: string;
  orgId: string;
  role: MembershipRole;
  createdAt: Date;
  updatedAt: Date;
};

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

type InMemoryShare = {
  id: string;
  fileId: string;
  orgId: string;
  createdByUserId: string;
  tokenHash: string;
  passwordHash: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type InMemoryAuditEvent = {
  id: string;
  orgId: string | null;
  actorUserId: string | null;
  actorType: AuditActorType;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: AuditResult;
  ipAddress: string | null;
  userAgent: string | null;
  metadataJson: unknown;
  createdAt: Date;
};

class InMemoryPrismaService {
  private readonly usersById = new Map<string, InMemoryUser>();
  private readonly orgsById = new Map<string, InMemoryOrg>();
  private readonly membershipsById = new Map<string, InMemoryMembership>();
  private readonly filesById = new Map<string, InMemoryFile>();
  private readonly sharesById = new Map<string, InMemoryShare>();
  private readonly shareIdByTokenHash = new Map<string, string>();
  private readonly auditEvents: InMemoryAuditEvent[] = [];

  readonly user = {
    findUnique: async (args: { where: { id?: string; email?: string } }) => {
      if (args.where.id) {
        const row = this.usersById.get(args.where.id);
        return row ? this.cloneUser(row) : null;
      }

      if (args.where.email) {
        const found = [...this.usersById.values()].find((user) => user.email === args.where.email);
        return found ? this.cloneUser(found) : null;
      }

      return null;
    },
  };

  readonly org = {
    create: async (args: {
      data: { name: string; slug: string };
      select?: { id?: true };
    }) => {
      const row: InMemoryOrg = {
        id: randomUUID(),
        name: args.data.name,
        slug: args.data.slug,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.orgsById.set(row.id, row);

      if (args.select?.id) {
        return { id: row.id };
      }

      return { ...row };
    },
  };

  readonly membership = {
    findUnique: async (args: {
      where: { userId_orgId: { userId: string; orgId: string } };
      select?: { role?: true };
    }) => {
      const row = [...this.membershipsById.values()].find(
        (membership) =>
          membership.userId === args.where.userId_orgId.userId &&
          membership.orgId === args.where.userId_orgId.orgId,
      );
      if (!row) {
        return null;
      }

      if (args.select?.role) {
        return { role: row.role };
      }

      return { ...row };
    },
    create: async (args: {
      data: { userId: string; orgId: string; role: MembershipRole };
    }) => {
      const row: InMemoryMembership = {
        id: randomUUID(),
        userId: args.data.userId,
        orgId: args.data.orgId,
        role: args.data.role,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.membershipsById.set(row.id, row);
      return { ...row };
    },
  };

  readonly file = {
    findUnique: async (args: {
      where: { id: string };
      select?: Record<string, true>;
    }) => {
      const row = this.filesById.get(args.where.id);
      if (!row) {
        return null;
      }

      if (args.select) {
        return this.pickFields(row, args.select);
      }

      return this.cloneFile(row);
    },
  };

  readonly share = {
    create: async (args: {
      data: {
        fileId: string;
        orgId: string;
        createdByUserId: string;
        tokenHash: string;
        passwordHash: string | null;
        maxDownloads: number | null;
        expiresAt: Date;
      };
    }) => {
      const row: InMemoryShare = {
        id: randomUUID(),
        fileId: args.data.fileId,
        orgId: args.data.orgId,
        createdByUserId: args.data.createdByUserId,
        tokenHash: args.data.tokenHash,
        passwordHash: args.data.passwordHash,
        maxDownloads: args.data.maxDownloads,
        downloadCount: 0,
        expiresAt: new Date(args.data.expiresAt),
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.sharesById.set(row.id, row);
      this.shareIdByTokenHash.set(row.tokenHash, row.id);
      return this.cloneShare(row);
    },
    findUnique: async (args: {
      where: { id?: string; tokenHash?: string };
      include?: { file?: { select?: Record<string, true> } };
    }) => {
      const row = args.where.id
        ? this.sharesById.get(args.where.id)
        : args.where.tokenHash
          ? this.sharesById.get(this.shareIdByTokenHash.get(args.where.tokenHash) ?? '')
          : undefined;
      if (!row) {
        return null;
      }

      if (!args.include?.file) {
        return this.cloneShare(row);
      }

      const file = this.filesById.get(row.fileId);
      if (!file) {
        return null;
      }

      return {
        ...this.cloneShare(row),
        file: args.include.file.select ? this.pickFields(file, args.include.file.select) : this.cloneFile(file),
      };
    },
    update: async (args: {
      where: { id: string };
      data: {
        revokedAt?: Date;
        downloadCount?: { increment: number };
      };
    }) => {
      const row = this.sharesById.get(args.where.id);
      if (!row) {
        throw new Error('share not found');
      }

      if (args.data.revokedAt !== undefined) {
        row.revokedAt = new Date(args.data.revokedAt);
      }
      if (args.data.downloadCount?.increment) {
        row.downloadCount += args.data.downloadCount.increment;
      }
      row.updatedAt = new Date();

      return this.cloneShare(row);
    },
    updateMany: async (args: {
      where: {
        id: string;
        revokedAt?: null;
        expiresAt?: { gt: Date };
        downloadCount?: { lt: number };
      };
      data: { downloadCount: { increment: number } };
    }) => {
      const row = this.sharesById.get(args.where.id);
      if (!row) {
        return { count: 0 };
      }

      if (args.where.revokedAt === null && row.revokedAt !== null) {
        return { count: 0 };
      }
      if (args.where.expiresAt && row.expiresAt.getTime() <= args.where.expiresAt.gt.getTime()) {
        return { count: 0 };
      }
      if (args.where.downloadCount && row.downloadCount >= args.where.downloadCount.lt) {
        return { count: 0 };
      }

      row.downloadCount += args.data.downloadCount.increment;
      row.updatedAt = new Date();
      return { count: 1 };
    },
  };

  readonly auditEvent = {
    create: async (args: {
      data: Omit<InMemoryAuditEvent, 'id' | 'createdAt'>;
    }) => {
      const row: InMemoryAuditEvent = {
        id: randomUUID(),
        ...args.data,
        createdAt: new Date(),
      };
      this.auditEvents.push(row);
      return { ...row };
    },
    findMany: async (args: {
      where?: {
        orgId?: string;
        actorType?: AuditActorType;
        action?: string;
        resourceType?: string;
        resourceId?: string;
        result?: AuditResult;
        createdAt?: { gte?: Date; lte?: Date };
      };
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
    }) => {
      const filtered = this.auditEvents.filter((row) => {
        const where = args.where;
        if (!where) {
          return true;
        }

        if (where.orgId !== undefined && row.orgId !== where.orgId) {
          return false;
        }
        if (where.actorType !== undefined && row.actorType !== where.actorType) {
          return false;
        }
        if (where.action !== undefined && row.action !== where.action) {
          return false;
        }
        if (where.resourceType !== undefined && row.resourceType !== where.resourceType) {
          return false;
        }
        if (where.resourceId !== undefined && row.resourceId !== where.resourceId) {
          return false;
        }
        if (where.result !== undefined && row.result !== where.result) {
          return false;
        }
        if (where.createdAt?.gte && row.createdAt.getTime() < where.createdAt.gte.getTime()) {
          return false;
        }
        if (where.createdAt?.lte && row.createdAt.getTime() > where.createdAt.lte.getTime()) {
          return false;
        }

        return true;
      });

      const sorted = [...filtered].sort((a, b) =>
        args.orderBy?.createdAt === 'asc'
          ? a.createdAt.getTime() - b.createdAt.getTime()
          : b.createdAt.getTime() - a.createdAt.getTime(),
      );
      const limited = args.take !== undefined ? sorted.slice(0, args.take) : sorted;
      return limited.map((row) => ({ ...row, createdAt: new Date(row.createdAt) }));
    },
  };

  async checkConnection(): Promise<boolean> {
    return true;
  }

  reset(): void {
    this.usersById.clear();
    this.orgsById.clear();
    this.membershipsById.clear();
    this.filesById.clear();
    this.sharesById.clear();
    this.shareIdByTokenHash.clear();
    this.auditEvents.length = 0;
  }

  seedUser(params: { email: string; role: UserRole }): InMemoryUser {
    const row: InMemoryUser = {
      id: randomUUID(),
      email: params.email.toLowerCase(),
      role: params.role,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.usersById.set(row.id, row);
    return this.cloneUser(row);
  }

  seedOrg(params: { name: string; slug: string }): InMemoryOrg {
    const row: InMemoryOrg = {
      id: randomUUID(),
      name: params.name,
      slug: params.slug,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.orgsById.set(row.id, row);
    return { ...row };
  }

  seedMembership(params: { userId: string; orgId: string; role: MembershipRole }): InMemoryMembership {
    const row: InMemoryMembership = {
      id: randomUUID(),
      userId: params.userId,
      orgId: params.orgId,
      role: params.role,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.membershipsById.set(row.id, row);
    return { ...row };
  }

  seedFile(params: {
    orgId: string;
    ownerUserId: string;
    filename: string;
    contentType: string;
    storageKey: string;
    status: FileStatus;
    wrappedDek: string | null;
    encryptionIv: string | null;
    encryptionTag: string | null;
  }): InMemoryFile {
    const now = new Date();
    const row: InMemoryFile = {
      id: randomUUID(),
      orgId: params.orgId,
      ownerUserId: params.ownerUserId,
      filename: params.filename,
      contentType: params.contentType,
      sizeBytes: BigInt(64),
      storageKey: params.storageKey,
      status: params.status,
      wrappedDek: params.wrappedDek,
      encryptionAlg: params.wrappedDek ? 'aes-256-gcm' : null,
      encryptionIv: params.encryptionIv,
      encryptionTag: params.encryptionTag,
      scanResult: params.status === FileStatus.active ? 'clean' : null,
      scanCompletedAt: params.status === FileStatus.active ? now : null,
      expiresAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.filesById.set(row.id, row);
    return this.cloneFile(row);
  }

  private cloneUser(row: InMemoryUser): InMemoryUser {
    return {
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
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

  private cloneShare(row: InMemoryShare): InMemoryShare {
    return {
      ...row,
      expiresAt: new Date(row.expiresAt),
      revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  private pickFields<T extends Record<string, unknown>>(row: T, select: Record<string, true>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(select)) {
      result[key] = row[key];
    }

    return result;
  }
}

class InMemoryObjectStorageService {
  private readonly objects = new Map<string, Buffer>();

  async putObject(storageKey: string, data: Buffer): Promise<void> {
    this.objects.set(storageKey, Buffer.from(data));
  }

  async getObject(storageKey: string): Promise<Buffer> {
    const value = this.objects.get(storageKey);
    if (!value) {
      throw new Error('object not found');
    }

    return Buffer.from(value);
  }
}

class InMemoryVaultTransitService {
  async wrapDek(plainDek: Buffer): Promise<string> {
    return `wrapped:${plainDek.toString('base64')}`;
  }

  async unwrapDek(wrappedDek: string): Promise<Buffer> {
    if (!wrappedDek.startsWith('wrapped:')) {
      throw new Error('invalid wrapped dek');
    }

    return Buffer.from(wrappedDek.slice('wrapped:'.length), 'base64');
  }
}

class InMemoryFileQueueService {
  async enqueueScan(): Promise<void> {}
}

function signAccessToken(claims: {
  sub: string;
  email: string;
  role: UserRole;
  secret: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: claims.sub,
      email: claims.email,
      role: claims.role,
      type: 'access',
      iat: now,
      exp: now + 900,
    }),
  ).toString('base64url');
  const message = `${header}.${payload}`;
  const signature = createHmac('sha256', claims.secret).update(message).digest('base64url');
  return `${message}.${signature}`;
}

function encryptAesGcm(plaintext: Buffer, dek: Buffer): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

describe('shares and audit endpoints', () => {
  let app: INestApplication;
  let prisma: InMemoryPrismaService;
  let objectStorage: InMemoryObjectStorageService;
  let vaultTransit: InMemoryVaultTransitService;
  const jwtSecret = 'shares-test-secret';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = jwtSecret;

    prisma = new InMemoryPrismaService();
    objectStorage = new InMemoryObjectStorageService();
    vaultTransit = new InMemoryVaultTransitService();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(MinioObjectStorageService)
      .useValue(objectStorage)
      .overrideProvider(VaultTransitService)
      .useValue(vaultTransit)
      .overrideProvider(FileQueueService)
      .useValue(new InMemoryFileQueueService())
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApiApplication(app);
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.reset();
  });

  it('creates password-protected shares and enforces usage limits', async () => {
    const owner = prisma.seedUser({ email: 'owner@local.test', role: UserRole.member });
    const org = prisma.seedOrg({ name: 'Org One', slug: 'org-one' });
    prisma.seedMembership({
      userId: owner.id,
      orgId: org.id,
      role: MembershipRole.admin,
    });

    const plaintext = Buffer.from('phase6-shared-payload', 'utf8');
    const dek = randomBytes(32);
    const encrypted = encryptAesGcm(plaintext, dek);
    const storageKey = `files/${org.id}/${randomUUID()}`;
    await objectStorage.putObject(storageKey, encrypted.ciphertext);

    const wrappedDek = await vaultTransit.wrapDek(dek);
    const file = prisma.seedFile({
      orgId: org.id,
      ownerUserId: owner.id,
      filename: 'shared.txt',
      contentType: 'text/plain',
      storageKey,
      status: FileStatus.active,
      wrappedDek,
      encryptionIv: encrypted.iv.toString('base64'),
      encryptionTag: encrypted.tag.toString('base64'),
    });

    const ownerToken = signAccessToken({
      sub: owner.id,
      email: owner.email,
      role: owner.role,
      secret: jwtSecret,
    });
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();

    const createResponse = await request(app.getHttpServer())
      .post('/v1/shares')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fileId: file.id,
        expiresAt,
        maxDownloads: 1,
        password: 'super-secret-password',
      });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.body.fileId).toBe(file.id);
    expect(createResponse.body.shareToken).toBeTruthy();
    expect(createResponse.body.requiresPassword).toBe(true);

    const deniedWithoutPassword = await request(app.getHttpServer())
      .post('/v1/shares/access')
      .send({
        shareToken: createResponse.body.shareToken,
      });
    expect(deniedWithoutPassword.statusCode).toBe(403);

    const firstDownload = await request(app.getHttpServer())
      .post('/v1/shares/access')
      .send({
        shareToken: createResponse.body.shareToken,
        password: 'super-secret-password',
      });
    expect(firstDownload.statusCode).toBe(200);
    expect(
      Buffer.from(firstDownload.body.contentBase64, 'base64').toString('utf8'),
    ).toBe('phase6-shared-payload');

    const secondDownload = await request(app.getHttpServer())
      .post('/v1/shares/access')
      .send({
        shareToken: createResponse.body.shareToken,
        password: 'super-secret-password',
      });
    expect(secondDownload.statusCode).toBe(403);
  });

  it('enforces org boundary on share creation', async () => {
    const owner = prisma.seedUser({ email: 'owner2@local.test', role: UserRole.member });
    const outsider = prisma.seedUser({ email: 'outsider@local.test', role: UserRole.member });
    const org = prisma.seedOrg({ name: 'Org Two', slug: 'org-two' });
    prisma.seedMembership({
      userId: owner.id,
      orgId: org.id,
      role: MembershipRole.admin,
    });

    const plaintext = Buffer.from('org-boundary', 'utf8');
    const dek = randomBytes(32);
    const encrypted = encryptAesGcm(plaintext, dek);
    const storageKey = `files/${org.id}/${randomUUID()}`;
    await objectStorage.putObject(storageKey, encrypted.ciphertext);
    const wrappedDek = await vaultTransit.wrapDek(dek);
    const file = prisma.seedFile({
      orgId: org.id,
      ownerUserId: owner.id,
      filename: 'org.txt',
      contentType: 'text/plain',
      storageKey,
      status: FileStatus.active,
      wrappedDek,
      encryptionIv: encrypted.iv.toString('base64'),
      encryptionTag: encrypted.tag.toString('base64'),
    });

    const outsiderToken = signAccessToken({
      sub: outsider.id,
      email: outsider.email,
      role: outsider.role,
      secret: jwtSecret,
    });

    const response = await request(app.getHttpServer())
      .post('/v1/shares')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({
        fileId: file.id,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      });

    expect(response.statusCode).toBe(403);
  });

  it('revokes shares and blocks further access', async () => {
    const owner = prisma.seedUser({ email: 'owner3@local.test', role: UserRole.member });
    const org = prisma.seedOrg({ name: 'Org Three', slug: 'org-three' });
    prisma.seedMembership({
      userId: owner.id,
      orgId: org.id,
      role: MembershipRole.admin,
    });

    const plaintext = Buffer.from('revocation-test', 'utf8');
    const dek = randomBytes(32);
    const encrypted = encryptAesGcm(plaintext, dek);
    const storageKey = `files/${org.id}/${randomUUID()}`;
    await objectStorage.putObject(storageKey, encrypted.ciphertext);
    const wrappedDek = await vaultTransit.wrapDek(dek);
    const file = prisma.seedFile({
      orgId: org.id,
      ownerUserId: owner.id,
      filename: 'revoke.txt',
      contentType: 'text/plain',
      storageKey,
      status: FileStatus.active,
      wrappedDek,
      encryptionIv: encrypted.iv.toString('base64'),
      encryptionTag: encrypted.tag.toString('base64'),
    });

    const token = signAccessToken({
      sub: owner.id,
      email: owner.email,
      role: owner.role,
      secret: jwtSecret,
    });
    const createResponse = await request(app.getHttpServer())
      .post('/v1/shares')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fileId: file.id,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      });

    expect(createResponse.statusCode).toBe(201);

    const revokeResponse = await request(app.getHttpServer())
      .post(`/v1/shares/${createResponse.body.shareId}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.body.shareId).toBe(createResponse.body.shareId);

    const accessAfterRevoke = await request(app.getHttpServer())
      .post('/v1/shares/access')
      .send({
        shareToken: createResponse.body.shareToken,
      });
    expect(accessAfterRevoke.statusCode).toBe(403);
  });

  it('supports admin audit query/export and rejects member access', async () => {
    const admin = prisma.seedUser({ email: 'admin@local.test', role: UserRole.admin });
    const member = prisma.seedUser({ email: 'member@local.test', role: UserRole.member });
    const org = prisma.seedOrg({ name: 'Org Audit', slug: 'org-audit' });
    prisma.seedMembership({
      userId: admin.id,
      orgId: org.id,
      role: MembershipRole.admin,
    });

    const plaintext = Buffer.from('audit-payload', 'utf8');
    const dek = randomBytes(32);
    const encrypted = encryptAesGcm(plaintext, dek);
    const storageKey = `files/${org.id}/${randomUUID()}`;
    await objectStorage.putObject(storageKey, encrypted.ciphertext);
    const wrappedDek = await vaultTransit.wrapDek(dek);
    const file = prisma.seedFile({
      orgId: org.id,
      ownerUserId: admin.id,
      filename: 'audit.txt',
      contentType: 'text/plain',
      storageKey,
      status: FileStatus.active,
      wrappedDek,
      encryptionIv: encrypted.iv.toString('base64'),
      encryptionTag: encrypted.tag.toString('base64'),
    });

    const adminToken = signAccessToken({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      secret: jwtSecret,
    });
    const memberToken = signAccessToken({
      sub: member.id,
      email: member.email,
      role: member.role,
      secret: jwtSecret,
    });

    const createShare = await request(app.getHttpServer())
      .post('/v1/shares')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fileId: file.id,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
    expect(createShare.statusCode).toBe(201);

    const memberQuery = await request(app.getHttpServer())
      .get('/v1/audit/events?resourceType=share')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberQuery.statusCode).toBe(403);

    const memberSummary = await request(app.getHttpServer())
      .get('/v1/audit/events/summary?resourceType=share')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberSummary.statusCode).toBe(403);

    const adminQuery = await request(app.getHttpServer())
      .get('/v1/audit/events?resourceType=share&limit=20')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminQuery.statusCode).toBe(200);
    expect(adminQuery.body.count).toBeGreaterThan(0);
    expect(adminQuery.body.events.some((event: { action: string }) => event.action === 'share.create')).toBe(
      true,
    );

    const exportResponse = await request(app.getHttpServer())
      .get('/v1/audit/events/export?resourceType=share&limit=20')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.headers['content-type']).toContain('application/x-ndjson');
    expect(exportResponse.text).toContain('"action":"share.create"');

    const summaryResponse = await request(app.getHttpServer())
      .get('/v1/audit/events/summary?resourceType=share&limit=20&top=5')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(summaryResponse.statusCode).toBe(200);
    expect(summaryResponse.body.sampledCount).toBeGreaterThan(0);
    expect(summaryResponse.body.sampleLimit).toBe(20);
    expect(summaryResponse.body.topCount).toBe(5);
    expect(
      summaryResponse.body.byAction.some(
        (bucket: { action: string; count: number }) =>
          bucket.action === 'share.create' && bucket.count >= 1,
      ),
    ).toBe(true);
  });
});
