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
import { PrismaService } from '../src/modules/persistence/prisma.service.js';

type InMemoryUser = {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type InMemoryMembership = {
  id: string;
  userId: string;
  orgId: string;
  role: MembershipRole;
};

type InMemoryFile = {
  id: string;
  orgId: string;
  ownerUserId: string;
  filename: string;
  contentType: string;
  status: FileStatus;
  createdAt: Date;
  updatedAt: Date;
};

class InMemoryPrismaService {
  private readonly usersById = new Map<string, InMemoryUser>();
  private readonly membershipsById = new Map<string, InMemoryMembership>();
  private readonly filesById = new Map<string, InMemoryFile>();

  readonly user = {
    findUnique: async (args: { where: { id?: string; email?: string } }) => {
      if (args.where.id) {
        return this.usersById.get(args.where.id) ?? null;
      }

      if (args.where.email) {
        const match = [...this.usersById.values()].find((row) => row.email === args.where.email);
        return match ?? null;
      }

      return null;
    },
  };

  readonly membership = {
    findMany: async (args: { where: { userId: string }; select: { orgId: true } }) => {
      return [...this.membershipsById.values()]
        .filter((row) => row.userId === args.where.userId)
        .map((row) => ({ orgId: row.orgId }));
    },
  };

  readonly file = {
    findMany: async (args: {
      where: {
        orgId: { in: string[] };
        OR: Array<{
          filename?: { contains: string; mode: 'insensitive' };
          contentType?: { contains: string; mode: 'insensitive' };
        }>;
      };
      orderBy: { updatedAt: 'desc' };
      take: number;
    }) => {
      const queryValue = args.where.OR[0]?.filename?.contains?.toLowerCase() ?? '';
      return [...this.filesById.values()]
        .filter((row) => args.where.orgId.in.includes(row.orgId))
        .filter(
          (row) =>
            row.filename.toLowerCase().includes(queryValue) ||
            row.contentType.toLowerCase().includes(queryValue),
        )
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, args.take);
    },
  };

  reset(): void {
    this.usersById.clear();
    this.membershipsById.clear();
    this.filesById.clear();
  }

  seedUser(params: { email: string; role: UserRole }): InMemoryUser {
    const now = new Date();
    const row: InMemoryUser = {
      id: randomUUID(),
      email: params.email.toLowerCase(),
      role: params.role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.usersById.set(row.id, row);
    return { ...row };
  }

  seedMembership(params: { userId: string; orgId: string; role: MembershipRole }): void {
    this.membershipsById.set(randomUUID(), {
      id: randomUUID(),
      userId: params.userId,
      orgId: params.orgId,
      role: params.role,
    });
  }

  seedFile(params: {
    orgId: string;
    ownerUserId: string;
    filename: string;
    contentType: string;
    status: FileStatus;
  }): void {
    const now = new Date();
    this.filesById.set(randomUUID(), {
      id: randomUUID(),
      orgId: params.orgId,
      ownerUserId: params.ownerUserId,
      filename: params.filename,
      contentType: params.contentType,
      status: params.status,
      createdAt: now,
      updatedAt: now,
    });
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

describe('search endpoints', () => {
  let app: INestApplication;
  let prisma: InMemoryPrismaService;
  const jwtSecret = 'search-test-secret';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = jwtSecret;
    process.env.MFA_TOTP_SECRET_KEY = 'test-mfa-totp-secret-key';
    process.env.OPENSEARCH_ENABLED = 'false';

    prisma = new InMemoryPrismaService();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApiApplication(app);
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.OPENSEARCH_ENABLED;
  });

  beforeEach(() => {
    prisma.reset();
  });

  it('searches file metadata for actor org scope', async () => {
    const user = prisma.seedUser({
      email: 'search-admin@local.test',
      role: UserRole.admin,
    });
    const orgId = randomUUID();
    prisma.seedMembership({
      userId: user.id,
      orgId,
      role: MembershipRole.admin,
    });
    prisma.seedFile({
      orgId,
      ownerUserId: user.id,
      filename: 'quarterly-report.pdf',
      contentType: 'application/pdf',
      status: FileStatus.active,
    });
    prisma.seedFile({
      orgId: randomUUID(),
      ownerUserId: randomUUID(),
      filename: 'other-org-report.pdf',
      contentType: 'application/pdf',
      status: FileStatus.active,
    });

    const token = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      secret: jwtSecret,
    });

    const response = await request(app.getHttpServer())
      .get('/v1/search/files')
      .query({ q: 'report', limit: 10 })
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.source).toBe('db-disabled');
    expect(response.body.count).toBe(1);
    expect(response.body.items[0].filename).toContain('quarterly-report');
  });

  it('requires authentication for search endpoint', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/search/files')
      .query({ q: 'report' });

    expect(response.statusCode).toBe(401);
  });
});
