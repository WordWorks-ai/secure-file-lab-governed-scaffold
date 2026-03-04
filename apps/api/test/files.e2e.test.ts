import 'reflect-metadata';

import { FileStatus, MembershipRole, UserRole } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApiApplication } from '../src/bootstrap/configure-api-application.js';
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

class InMemoryPrismaService {
  private readonly usersById = new Map<string, InMemoryUser>();
  private readonly membershipsById = new Map<string, InMemoryMembership>();
  private readonly orgsById = new Map<string, InMemoryOrg>();
  private readonly filesById = new Map<string, InMemoryFile>();
  private readonly auditEvents: Array<Record<string, unknown>> = [];

  readonly user = {
    findUnique: async (args: { where: { id?: string; email?: string } }) => {
      if (args.where.id) {
        const user = this.usersById.get(args.where.id);
        return user ? this.cloneUser(user) : null;
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
    findFirst: async (args: {
      where: { userId: string };
      orderBy?: { createdAt: 'asc' | 'desc' };
      select?: { orgId?: true };
    }) => {
      const matches = [...this.membershipsById.values()].filter((row) => row.userId === args.where.userId);
      if (matches.length === 0) {
        return null;
      }

      const ordered = [...matches].sort((a, b) =>
        args.orderBy?.createdAt === 'desc'
          ? b.createdAt.getTime() - a.createdAt.getTime()
          : a.createdAt.getTime() - b.createdAt.getTime(),
      );
      const row = ordered[0];
      if (args.select?.orgId) {
        return { orgId: row.orgId };
      }

      return { ...row };
    },
    findUnique: async (args: {
      where: { userId_orgId: { userId: string; orgId: string } };
    }) => {
      const row = [...this.membershipsById.values()].find(
        (membership) =>
          membership.userId === args.where.userId_orgId.userId &&
          membership.orgId === args.where.userId_orgId.orgId,
      );
      return row ? { ...row } : null;
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
    create: async (args: {
      data: {
        orgId: string;
        ownerUserId: string;
        filename: string;
        contentType: string;
        sizeBytes: bigint;
        storageKey: string;
        status: FileStatus;
        expiresAt: Date | null;
      };
    }) => {
      const row: InMemoryFile = {
        id: randomUUID(),
        orgId: args.data.orgId,
        ownerUserId: args.data.ownerUserId,
        filename: args.data.filename,
        contentType: args.data.contentType,
        sizeBytes: args.data.sizeBytes,
        storageKey: args.data.storageKey,
        status: args.data.status,
        wrappedDek: null,
        encryptionAlg: null,
        encryptionIv: null,
        encryptionTag: null,
        scanResult: null,
        scanCompletedAt: null,
        expiresAt: args.data.expiresAt,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.filesById.set(row.id, row);
      return this.cloneFile(row);
    },
    update: async (args: {
      where: { id: string };
      data: {
        status?: FileStatus;
        wrappedDek?: string | null;
        encryptionAlg?: string | null;
        encryptionIv?: string | null;
        encryptionTag?: string | null;
        scanResult?: string | null;
        scanCompletedAt?: Date | null;
        updatedAt?: Date;
      };
    }) => {
      const row = this.filesById.get(args.where.id);
      if (!row) {
        throw new Error('file not found');
      }

      if (args.data.status !== undefined) {
        row.status = args.data.status;
      }
      if (args.data.wrappedDek !== undefined) {
        row.wrappedDek = args.data.wrappedDek;
      }
      if (args.data.encryptionAlg !== undefined) {
        row.encryptionAlg = args.data.encryptionAlg;
      }
      if (args.data.encryptionIv !== undefined) {
        row.encryptionIv = args.data.encryptionIv;
      }
      if (args.data.encryptionTag !== undefined) {
        row.encryptionTag = args.data.encryptionTag;
      }
      if (args.data.scanResult !== undefined) {
        row.scanResult = args.data.scanResult;
      }
      if (args.data.scanCompletedAt !== undefined) {
        row.scanCompletedAt = args.data.scanCompletedAt;
      }
      row.updatedAt = args.data.updatedAt ?? new Date();

      return this.cloneFile(row);
    },
    findUnique: async (args: { where: { id: string } }) => {
      const row = this.filesById.get(args.where.id);
      return row ? this.cloneFile(row) : null;
    },
  };

  readonly auditEvent = {
    create: async (args: { data: Record<string, unknown> }) => {
      this.auditEvents.push(args.data);
      return { id: randomUUID(), ...args.data };
    },
  };

  async checkConnection(): Promise<boolean> {
    return true;
  }

  reset(): void {
    this.usersById.clear();
    this.membershipsById.clear();
    this.orgsById.clear();
    this.filesById.clear();
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

  getFile(fileId: string): InMemoryFile | undefined {
    const row = this.filesById.get(fileId);
    return row ? this.cloneFile(row) : undefined;
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

  getRawObject(storageKey: string): Buffer | undefined {
    const value = this.objects.get(storageKey);
    return value ? Buffer.from(value) : undefined;
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

describe('files endpoints', () => {
  let app: INestApplication;
  let prisma: InMemoryPrismaService;
  let objectStorage: InMemoryObjectStorageService;
  const jwtSecret = 'files-test-secret';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = jwtSecret;
    process.env.FILE_UPLOAD_MAX_BYTES = '1024';
    process.env.FILE_UPLOAD_ALLOWED_MIME_TYPES = 'text/plain,application/json';

    prisma = new InMemoryPrismaService();
    objectStorage = new InMemoryObjectStorageService();
    const vault = new InMemoryVaultTransitService();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(MinioObjectStorageService)
      .useValue(objectStorage)
      .overrideProvider(VaultTransitService)
      .useValue(vault)
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

  it('uploads encrypted content, enforces lifecycle gate, and allows download after activation', async () => {
    const user = prisma.seedUser({
      email: 'files-admin@local.test',
      role: UserRole.admin,
    });
    const token = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      secret: jwtSecret,
    });

    const originalText = 'hello phase 4';
    const uploadResponse = await request(app.getHttpServer())
      .post('/v1/files/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({
        filename: 'hello.txt',
        contentType: 'text/plain',
        contentBase64: Buffer.from(originalText, 'utf8').toString('base64'),
      });

    expect(uploadResponse.statusCode).toBe(201);
    expect(uploadResponse.body.status).toBe(FileStatus.scan_pending);
    const fileId = uploadResponse.body.fileId as string;
    const storageKey = uploadResponse.body.storageKey as string;

    const fileRow = prisma.getFile(fileId);
    expect(fileRow).toBeDefined();
    expect(fileRow?.wrappedDek).toBeTruthy();
    expect(fileRow?.encryptionAlg).toBe('aes-256-gcm');

    const encryptedObject = objectStorage.getRawObject(storageKey);
    expect(encryptedObject).toBeDefined();
    expect(encryptedObject?.toString('utf8')).not.toContain(originalText);

    const deniedDownload = await request(app.getHttpServer())
      .get(`/v1/files/${fileId}/download`)
      .set('Authorization', `Bearer ${token}`);
    expect(deniedDownload.statusCode).toBe(403);

    const activateResponse = await request(app.getHttpServer())
      .post(`/v1/files/${fileId}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(activateResponse.statusCode).toBe(200);
    expect(activateResponse.body.status).toBe(FileStatus.active);

    const downloadResponse = await request(app.getHttpServer())
      .get(`/v1/files/${fileId}/download`)
      .set('Authorization', `Bearer ${token}`);
    expect(downloadResponse.statusCode).toBe(200);
    expect(
      Buffer.from(downloadResponse.body.contentBase64, 'base64').toString('utf8'),
    ).toBe(originalText);
  });

  it('rejects unsupported content type', async () => {
    const user = prisma.seedUser({
      email: 'mime@local.test',
      role: UserRole.admin,
    });
    const token = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      secret: jwtSecret,
    });

    const response = await request(app.getHttpServer())
      .post('/v1/files/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({
        filename: 'bad.exe',
        contentType: 'application/x-msdownload',
        contentBase64: Buffer.from('abc').toString('base64'),
      });

    expect(response.statusCode).toBe(422);
  });

  it('rejects payloads that exceed configured size limit', async () => {
    const user = prisma.seedUser({
      email: 'size@local.test',
      role: UserRole.admin,
    });
    const token = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      secret: jwtSecret,
    });

    const oversized = Buffer.alloc(1500, 'a').toString('base64');
    const response = await request(app.getHttpServer())
      .post('/v1/files/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({
        filename: 'large.txt',
        contentType: 'text/plain',
        contentBase64: oversized,
      });

    expect(response.statusCode).toBe(413);
  });

  it('enforces RBAC on activation endpoint', async () => {
    const user = prisma.seedUser({
      email: 'member@local.test',
      role: UserRole.member,
    });
    const token = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      secret: jwtSecret,
    });

    const upload = await request(app.getHttpServer())
      .post('/v1/files/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({
        filename: 'note.txt',
        contentType: 'text/plain',
        contentBase64: Buffer.from('hello').toString('base64'),
      });

    const activate = await request(app.getHttpServer())
      .post(`/v1/files/${upload.body.fileId as string}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(activate.statusCode).toBe(403);
  });
});
