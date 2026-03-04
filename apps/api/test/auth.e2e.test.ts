import 'reflect-metadata';

import { hash } from '@node-rs/argon2';
import { AuditActorType, AuditResult, UserRole } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApiApplication } from '../src/bootstrap/configure-api-application.js';
import { KeycloakSsoService } from '../src/modules/auth/keycloak-sso.service.js';
import { PrismaService } from '../src/modules/persistence/prisma.service.js';

type FakeUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type FakeRefreshToken = {
  id: string;
  userId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  rotatedFromTokenId: string | null;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
  createdAt: Date;
};

type FakeAuditEvent = {
  id: string;
  action: string;
  resourceType: string;
  result: AuditResult;
  actorType: AuditActorType;
  actorUserId: string | null;
  orgId: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadataJson: unknown;
  createdAt: Date;
};

class InMemoryPrismaService {
  private readonly usersById = new Map<string, FakeUser>();
  private readonly usersByEmail = new Map<string, string>();
  private readonly refreshTokensById = new Map<string, FakeRefreshToken>();
  private readonly refreshTokenIdByHash = new Map<string, string>();
  private readonly auditEvents: FakeAuditEvent[] = [];

  readonly user = {
    findUnique: async (args: { where: { email?: string; id?: string } }) => {
      const where = args.where;
      if (where.email) {
        const userId = this.usersByEmail.get(where.email);
        if (!userId) {
          return null;
        }

        const user = this.usersById.get(userId);
        return user ? this.cloneUser(user) : null;
      }

      if (where.id) {
        const user = this.usersById.get(where.id);
        return user ? this.cloneUser(user) : null;
      }

      return null;
    },
    create: async (args: {
      data: {
        email: string;
        passwordHash: string;
        role: UserRole;
        isActive: boolean;
      };
    }) => {
      const row: FakeUser = {
        id: randomUUID(),
        email: args.data.email.trim().toLowerCase(),
        passwordHash: args.data.passwordHash,
        role: args.data.role,
        isActive: args.data.isActive,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.usersById.set(row.id, row);
      this.usersByEmail.set(row.email, row.id);
      return this.cloneUser(row);
    },
  };

  readonly refreshToken = {
    create: async (args: {
      data: {
        userId: string;
        tokenHash: string;
        issuedAt: Date;
        expiresAt: Date;
        rotatedFromTokenId?: string | null;
      };
    }) => {
      const row: FakeRefreshToken = {
        id: randomUUID(),
        userId: args.data.userId,
        tokenHash: args.data.tokenHash,
        issuedAt: new Date(args.data.issuedAt),
        expiresAt: new Date(args.data.expiresAt),
        rotatedFromTokenId: args.data.rotatedFromTokenId ?? null,
        revokedAt: null,
        replacedByTokenId: null,
        createdAt: new Date(),
      };

      this.refreshTokensById.set(row.id, row);
      this.refreshTokenIdByHash.set(row.tokenHash, row.id);
      return this.cloneRefreshToken(row);
    },
    findUnique: async (args: {
      where: { tokenHash: string };
      include?: { user?: boolean };
    }) => {
      const tokenId = this.refreshTokenIdByHash.get(args.where.tokenHash);
      if (!tokenId) {
        return null;
      }

      const token = this.refreshTokensById.get(tokenId);
      if (!token) {
        return null;
      }

      if (args.include?.user) {
        const user = this.usersById.get(token.userId);
        if (!user) {
          return null;
        }

        return {
          ...this.cloneRefreshToken(token),
          user: this.cloneUser(user),
        };
      }

      return this.cloneRefreshToken(token);
    },
    update: async (args: {
      where: { id: string };
      data: { revokedAt?: Date | null; replacedByTokenId?: string | null };
    }) => {
      const token = this.refreshTokensById.get(args.where.id);
      if (!token) {
        throw new Error('refresh token not found');
      }

      if (args.data.revokedAt !== undefined) {
        token.revokedAt = args.data.revokedAt ? new Date(args.data.revokedAt) : null;
      }
      if (args.data.replacedByTokenId !== undefined) {
        token.replacedByTokenId = args.data.replacedByTokenId;
      }

      return this.cloneRefreshToken(token);
    },
    updateMany: async (args: {
      where: { tokenHash: string; revokedAt: null };
      data: { revokedAt: Date };
    }) => {
      const tokenId = this.refreshTokenIdByHash.get(args.where.tokenHash);
      if (!tokenId) {
        return { count: 0 };
      }

      const token = this.refreshTokensById.get(tokenId);
      if (!token || token.revokedAt !== null) {
        return { count: 0 };
      }

      token.revokedAt = new Date(args.data.revokedAt);
      return { count: 1 };
    },
  };

  readonly auditEvent = {
    create: async (args: {
      data: Omit<FakeAuditEvent, 'id' | 'createdAt'> & { metadataJson?: unknown };
    }) => {
      const event: FakeAuditEvent = {
        id: randomUUID(),
        action: args.data.action,
        resourceType: args.data.resourceType,
        result: args.data.result,
        actorType: args.data.actorType,
        actorUserId: args.data.actorUserId ?? null,
        orgId: args.data.orgId ?? null,
        resourceId: args.data.resourceId ?? null,
        ipAddress: args.data.ipAddress ?? null,
        userAgent: args.data.userAgent ?? null,
        metadataJson: args.data.metadataJson ?? {},
        createdAt: new Date(),
      };

      this.auditEvents.push(event);
      return { ...event };
    },
  };

  async checkConnection(): Promise<boolean> {
    return true;
  }

  reset(): void {
    this.usersById.clear();
    this.usersByEmail.clear();
    this.refreshTokensById.clear();
    this.refreshTokenIdByHash.clear();
    this.auditEvents.length = 0;
  }

  async seedUser(params: {
    email: string;
    password: string;
    role: UserRole;
    isActive?: boolean;
  }): Promise<FakeUser> {
    const encodedPassword = await hash(params.password, {
      algorithm: 2,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const row: FakeUser = {
      id: randomUUID(),
      email: params.email.toLowerCase(),
      passwordHash: encodedPassword,
      role: params.role,
      isActive: params.isActive ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.usersById.set(row.id, row);
    this.usersByEmail.set(row.email, row.id);

    return this.cloneUser(row);
  }

  getAuditEvents(): FakeAuditEvent[] {
    return this.auditEvents.map((event) => ({
      ...event,
      createdAt: new Date(event.createdAt),
    }));
  }

  private cloneUser(row: FakeUser): FakeUser {
    return {
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  private cloneRefreshToken(row: FakeRefreshToken): FakeRefreshToken {
    return {
      ...row,
      issuedAt: new Date(row.issuedAt),
      expiresAt: new Date(row.expiresAt),
      revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
      createdAt: new Date(row.createdAt),
    };
  }
}

describe('auth endpoints', () => {
  let app: INestApplication;
  let prisma: InMemoryPrismaService;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_TTL = '1209600';
    process.env.JWT_ACCESS_TTL = '900';

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
  });

  beforeEach(() => {
    prisma.reset();
  });

  it('logs in, returns token pair, and authorizes admin route for admin user', async () => {
    const user = await prisma.seedUser({
      email: 'admin@local.test',
      password: 'StrongPassword!123',
      role: UserRole.admin,
    });

    const loginResponse = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'ADMIN@LOCAL.TEST',
      password: 'StrongPassword!123',
    });

    expect(loginResponse.statusCode).toBe(201);
    expect(loginResponse.body.tokenType).toBe('Bearer');
    expect(typeof loginResponse.body.accessToken).toBe('string');
    expect(typeof loginResponse.body.refreshToken).toBe('string');
    expect(loginResponse.body.user.id).toBe(user.id);

    const meResponse = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`);

    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.body.user.sub).toBe(user.id);
    expect(meResponse.body.user.role).toBe(UserRole.admin);

    const adminResponse = await request(app.getHttpServer())
      .get('/v1/auth/admin-check')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`);

    expect(adminResponse.statusCode).toBe(200);
    expect(adminResponse.body).toEqual({ allowed: true });
  });

  it('rotates refresh tokens and denies replay of rotated token', async () => {
    await prisma.seedUser({
      email: 'rotate@local.test',
      password: 'StrongPassword!123',
      role: UserRole.admin,
    });

    const loginResponse = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'rotate@local.test',
      password: 'StrongPassword!123',
    });

    expect(loginResponse.statusCode).toBe(201);
    const firstRefreshToken = loginResponse.body.refreshToken as string;

    const refreshResponse = await request(app.getHttpServer()).post('/v1/auth/refresh').send({
      refreshToken: firstRefreshToken,
    });

    expect(refreshResponse.statusCode).toBe(201);
    expect(refreshResponse.body.refreshToken).not.toBe(firstRefreshToken);

    const replayResponse = await request(app.getHttpServer()).post('/v1/auth/refresh').send({
      refreshToken: firstRefreshToken,
    });

    expect(replayResponse.statusCode).toBe(401);
  });

  it('revokes refresh token on logout', async () => {
    await prisma.seedUser({
      email: 'logout@local.test',
      password: 'StrongPassword!123',
      role: UserRole.admin,
    });

    const loginResponse = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'logout@local.test',
      password: 'StrongPassword!123',
    });

    const refreshToken = loginResponse.body.refreshToken as string;
    const logoutResponse = await request(app.getHttpServer()).post('/v1/auth/logout').send({
      refreshToken,
    });

    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.body).toEqual({ success: true });

    const refreshAfterLogout = await request(app.getHttpServer()).post('/v1/auth/refresh').send({
      refreshToken,
    });

    expect(refreshAfterLogout.statusCode).toBe(401);
  });

  it('denies admin route for member role', async () => {
    await prisma.seedUser({
      email: 'member@local.test',
      password: 'StrongPassword!123',
      role: UserRole.member,
    });

    const loginResponse = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'member@local.test',
      password: 'StrongPassword!123',
    });

    const adminResponse = await request(app.getHttpServer())
      .get('/v1/auth/admin-check')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`);

    expect(adminResponse.statusCode).toBe(403);
  });

  it('emits audit failure on invalid credentials', async () => {
    await prisma.seedUser({
      email: 'fail@local.test',
      password: 'StrongPassword!123',
      role: UserRole.admin,
    });

    const response = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'fail@local.test',
      password: 'wrong-password',
    });

    expect(response.statusCode).toBe(401);

    const events = prisma.getAuditEvents();
    expect(
      events.some(
        (event) => event.action === 'auth.login' && event.result === AuditResult.failure,
      ),
    ).toBe(true);
  });

  it('exchanges Keycloak access token and provisions local user on first login', async () => {
    const keycloakService = app.get(KeycloakSsoService);
    vi.spyOn(keycloakService, 'getIdentityFromAccessToken').mockResolvedValue({
      subject: 'kc-user-1',
      email: 'sso-user@local.test',
      preferredUsername: 'sso-user',
      roles: ['admin'],
    });
    vi.spyOn(keycloakService, 'isEnabled').mockReturnValue(true);

    const response = await request(app.getHttpServer()).post('/v1/auth/sso/exchange').send({
      accessToken: 'test-sso-access-token-1234567890',
    });

    expect(response.statusCode).toBe(201);
    expect(response.body.tokenType).toBe('Bearer');
    expect(response.body.user.email).toBe('sso-user@local.test');
    expect(response.body.user.role).toBe(UserRole.admin);

    const meResponse = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${response.body.accessToken as string}`);
    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.body.user.email).toBe('sso-user@local.test');
  });
});
