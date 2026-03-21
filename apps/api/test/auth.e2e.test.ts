import 'reflect-metadata';

import { hash } from '@node-rs/argon2';
import { AuditActorType, AuditResult, UserRole } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac, randomUUID } from 'node:crypto';
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

type FakeTotpFactor = {
  userId: string;
  secretEnvelope: string;
  isEnabled: boolean;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeWebauthnCredential = {
  id: string;
  userId: string;
  credentialId: string;
  label: string | null;
  publicKey: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  prevEventHash: string | null;
  eventHash: string | null;
  chainVersion: string;
  createdAt: Date;
};

class InMemoryPrismaService {
  private readonly usersById = new Map<string, FakeUser>();
  private readonly usersByEmail = new Map<string, string>();
  private readonly refreshTokensById = new Map<string, FakeRefreshToken>();
  private readonly refreshTokenIdByHash = new Map<string, string>();
  private readonly totpFactorsByUserId = new Map<string, FakeTotpFactor>();
  private readonly webauthnCredentialsById = new Map<string, FakeWebauthnCredential>();
  private readonly webauthnCredentialIdToRowId = new Map<string, string>();
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

  readonly userMfaTotpFactor = {
    findUnique: async (args: { where: { userId: string } }) => {
      const row = this.totpFactorsByUserId.get(args.where.userId);
      return row ? this.cloneTotpFactor(row) : null;
    },
    upsert: async (args: {
      where: { userId: string };
      create: {
        userId: string;
        secretEnvelope: string;
        isEnabled: boolean;
        verifiedAt: Date | null;
      };
      update: {
        secretEnvelope?: string;
        isEnabled?: boolean;
        verifiedAt?: Date | null;
      };
    }) => {
      const existing = this.totpFactorsByUserId.get(args.where.userId);
      const now = new Date();
      if (existing) {
        if (args.update.secretEnvelope !== undefined) {
          existing.secretEnvelope = args.update.secretEnvelope;
        }
        if (args.update.isEnabled !== undefined) {
          existing.isEnabled = args.update.isEnabled;
        }
        if (args.update.verifiedAt !== undefined) {
          existing.verifiedAt = args.update.verifiedAt ? new Date(args.update.verifiedAt) : null;
        }
        existing.updatedAt = now;
        return this.cloneTotpFactor(existing);
      }

      const created: FakeTotpFactor = {
        userId: args.create.userId,
        secretEnvelope: args.create.secretEnvelope,
        isEnabled: args.create.isEnabled,
        verifiedAt: args.create.verifiedAt ? new Date(args.create.verifiedAt) : null,
        createdAt: now,
        updatedAt: now,
      };

      this.totpFactorsByUserId.set(created.userId, created);
      return this.cloneTotpFactor(created);
    },
    update: async (args: {
      where: { userId: string };
      data: { isEnabled?: boolean; verifiedAt?: Date | null };
    }) => {
      const existing = this.totpFactorsByUserId.get(args.where.userId);
      if (!existing) {
        throw new Error('totp factor not found');
      }

      if (args.data.isEnabled !== undefined) {
        existing.isEnabled = args.data.isEnabled;
      }
      if (args.data.verifiedAt !== undefined) {
        existing.verifiedAt = args.data.verifiedAt ? new Date(args.data.verifiedAt) : null;
      }
      existing.updatedAt = new Date();
      return this.cloneTotpFactor(existing);
    },
    delete: async (args: { where: { userId: string } }) => {
      const existing = this.totpFactorsByUserId.get(args.where.userId);
      if (!existing) {
        throw new Error('totp factor not found');
      }
      this.totpFactorsByUserId.delete(args.where.userId);
      return this.cloneTotpFactor(existing);
    },
  };

  readonly userWebauthnCredential = {
    findMany: async (args: { where: { userId: string } }) =>
      Array.from(this.webauthnCredentialsById.values())
        .filter((credential) => credential.userId === args.where.userId)
        .map((credential) => this.cloneWebauthnCredential(credential)),
    findUnique: async (args: { where: { credentialId: string } }) => {
      const rowId = this.webauthnCredentialIdToRowId.get(args.where.credentialId);
      if (!rowId) {
        return null;
      }
      const credential = this.webauthnCredentialsById.get(rowId);
      return credential ? this.cloneWebauthnCredential(credential) : null;
    },
    findFirst: async (args: { where: { userId: string; credentialId: string } }) => {
      const rowId = this.webauthnCredentialIdToRowId.get(args.where.credentialId);
      if (!rowId) {
        return null;
      }
      const credential = this.webauthnCredentialsById.get(rowId);
      if (!credential || credential.userId !== args.where.userId) {
        return null;
      }
      return this.cloneWebauthnCredential(credential);
    },
    create: async (args: {
      data: {
        userId: string;
        credentialId: string;
        label: string | null;
        publicKey: string | null;
      };
    }) => {
      const now = new Date();
      const created: FakeWebauthnCredential = {
        id: randomUUID(),
        userId: args.data.userId,
        credentialId: args.data.credentialId,
        label: args.data.label,
        publicKey: args.data.publicKey,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.webauthnCredentialsById.set(created.id, created);
      this.webauthnCredentialIdToRowId.set(created.credentialId, created.id);
      return this.cloneWebauthnCredential(created);
    },
    update: async (args: {
      where: { id: string };
      data: {
        label?: string | null;
        publicKey?: string | null;
        lastUsedAt?: Date | null;
      };
    }) => {
      const credential = this.webauthnCredentialsById.get(args.where.id);
      if (!credential) {
        throw new Error('webauthn credential not found');
      }
      if (args.data.label !== undefined) {
        credential.label = args.data.label;
      }
      if (args.data.publicKey !== undefined) {
        credential.publicKey = args.data.publicKey;
      }
      if (args.data.lastUsedAt !== undefined) {
        credential.lastUsedAt = args.data.lastUsedAt ? new Date(args.data.lastUsedAt) : null;
      }
      credential.updatedAt = new Date();
      return this.cloneWebauthnCredential(credential);
    },
  };

  readonly auditEvent = {
    findFirst: async (args: {
      where?: { eventHash?: { not: null } };
      orderBy?: Array<{ createdAt: 'asc' | 'desc' } | { id: 'asc' | 'desc' }>;
      select?: { eventHash?: true };
    }) => {
      let rows = [...this.auditEvents];
      if (args.where?.eventHash?.not === null) {
        rows = rows.filter((row) => row.eventHash !== null);
      }
      rows.sort((left, right) => {
        for (const rule of args.orderBy ?? []) {
          if ('createdAt' in rule) {
            const delta = left.createdAt.getTime() - right.createdAt.getTime();
            if (delta !== 0) {
              return rule.createdAt === 'asc' ? delta : -delta;
            }
          } else if ('id' in rule) {
            const delta = left.id.localeCompare(right.id);
            if (delta !== 0) {
              return rule.id === 'asc' ? delta : -delta;
            }
          }
        }
        return 0;
      });

      const row = rows[0] ?? null;
      if (!row) {
        return null;
      }
      if (args.select?.eventHash) {
        return { eventHash: row.eventHash };
      }
      return { ...row };
    },
    create: async (args: {
      data: Omit<FakeAuditEvent, 'metadataJson'> & { metadataJson?: unknown };
    }) => {
      const event: FakeAuditEvent = {
        id: args.data.id,
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
        prevEventHash: args.data.prevEventHash ?? null,
        eventHash: args.data.eventHash ?? null,
        chainVersion: args.data.chainVersion,
        createdAt: new Date(args.data.createdAt),
      };

      this.auditEvents.push(event);
      return { ...event };
    },
  };

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this);
  }

  readonly $executeRaw = async (...args: unknown[]): Promise<number> => {
    void args;
    return 1;
  };

  async checkConnection(): Promise<boolean> {
    return true;
  }

  reset(): void {
    this.usersById.clear();
    this.usersByEmail.clear();
    this.refreshTokensById.clear();
    this.refreshTokenIdByHash.clear();
    this.totpFactorsByUserId.clear();
    this.webauthnCredentialsById.clear();
    this.webauthnCredentialIdToRowId.clear();
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

  private cloneTotpFactor(row: FakeTotpFactor): FakeTotpFactor {
    return {
      ...row,
      verifiedAt: row.verifiedAt ? new Date(row.verifiedAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  private cloneWebauthnCredential(row: FakeWebauthnCredential): FakeWebauthnCredential {
    return {
      ...row,
      lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const character of cleaned) {
    const index = alphabet.indexOf(character);
    if (index === -1) {
      throw new Error('invalid base32 secret');
    }
    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function generateTotpCode(secretBase32: string, atMs = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter), 0);
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binaryCode % 1_000_000).toString().padStart(6, '0');
}

function encodeWebauthnClientData(params: {
  type: 'webauthn.create' | 'webauthn.get';
  challenge: string;
  origin: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      type: params.type,
      challenge: params.challenge,
      origin: params.origin,
    }),
    'utf8',
  ).toString('base64url');
}

describe('auth endpoints', () => {
  let app: INestApplication;
  let prisma: InMemoryPrismaService;

  beforeAll(async () => {
    process.env.THROTTLE_LIMIT = '10000';
    process.env.THROTTLE_AUTH_LIMIT = '10000';
    process.env.THROTTLE_SHARE_LIMIT = '10000';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-chars';
    process.env.MFA_TOTP_SECRET_KEY = 'test-mfa-totp-secret-key-at-least-32-chars';
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

  it('enrolls TOTP MFA, enforces second factor on login, and supports disable flow', async () => {
    await prisma.seedUser({
      email: 'totp-user@local.test',
      password: 'StrongPassword!123',
      role: UserRole.member,
    });

    const initialLogin = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'totp-user@local.test',
      password: 'StrongPassword!123',
    });
    expect(initialLogin.statusCode).toBe(201);

    const enrollResponse = await request(app.getHttpServer())
      .post('/v1/auth/mfa/totp/enroll')
      .set('Authorization', `Bearer ${initialLogin.body.accessToken as string}`)
      .send({});
    expect(enrollResponse.statusCode).toBe(201);
    expect(typeof enrollResponse.body.secret).toBe('string');
    expect(typeof enrollResponse.body.otpauthUri).toBe('string');

    const verifyResponse = await request(app.getHttpServer())
      .post('/v1/auth/mfa/totp/verify')
      .set('Authorization', `Bearer ${initialLogin.body.accessToken as string}`)
      .send({
        code: generateTotpCode(enrollResponse.body.secret as string),
      });
    expect(verifyResponse.statusCode).toBe(201);
    expect(verifyResponse.body).toEqual({ enabled: true });

    const statusResponse = await request(app.getHttpServer())
      .get('/v1/auth/mfa/status')
      .set('Authorization', `Bearer ${initialLogin.body.accessToken as string}`);
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.body.totp.enabled).toBe(true);

    const missingMfaLogin = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'totp-user@local.test',
      password: 'StrongPassword!123',
    });
    expect(missingMfaLogin.statusCode).toBe(401);
    expect(missingMfaLogin.body.code).toBe('MFA_REQUIRED');
    expect(missingMfaLogin.body.methods).toContain('totp');

    const invalidTotpLogin = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'totp-user@local.test',
      password: 'StrongPassword!123',
      totpCode: '000000',
    });
    expect(invalidTotpLogin.statusCode).toBe(401);
    expect(invalidTotpLogin.body.code).toBe('MFA_INVALID');

    const validTotpLogin = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'totp-user@local.test',
      password: 'StrongPassword!123',
      totpCode: generateTotpCode(enrollResponse.body.secret as string),
    });
    expect(validTotpLogin.statusCode).toBe(201);
    expect(typeof validTotpLogin.body.accessToken).toBe('string');

    const disableResponse = await request(app.getHttpServer())
      .delete('/v1/auth/mfa/totp')
      .set('Authorization', `Bearer ${validTotpLogin.body.accessToken as string}`);
    expect(disableResponse.statusCode).toBe(200);
    expect(disableResponse.body).toEqual({ disabled: true });

    const loginAfterDisable = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'totp-user@local.test',
      password: 'StrongPassword!123',
    });
    expect(loginAfterDisable.statusCode).toBe(201);
    expect(typeof loginAfterDisable.body.accessToken).toBe('string');
  });

  it('registers WebAuthn credential and supports challenge-based MFA login', async () => {
    await prisma.seedUser({
      email: 'webauthn-user@local.test',
      password: 'StrongPassword!123',
      role: UserRole.member,
    });

    const initialLogin = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'webauthn-user@local.test',
      password: 'StrongPassword!123',
    });
    expect(initialLogin.statusCode).toBe(201);

    const registrationOptions = await request(app.getHttpServer())
      .post('/v1/auth/mfa/webauthn/register/options')
      .set('Authorization', `Bearer ${initialLogin.body.accessToken as string}`)
      .send({});
    expect(registrationOptions.statusCode).toBe(201);
    expect(typeof registrationOptions.body.challengeToken).toBe('string');
    expect(typeof registrationOptions.body.options?.challenge).toBe('string');

    const registerVerify = await request(app.getHttpServer())
      .post('/v1/auth/mfa/webauthn/register/verify')
      .set('Authorization', `Bearer ${initialLogin.body.accessToken as string}`)
      .send({
        challengeToken: registrationOptions.body.challengeToken,
        credentialId: Buffer.from('webauthn-credential-local-12345', 'utf8').toString('base64url'),
        clientDataJson: encodeWebauthnClientData({
          type: 'webauthn.create',
          challenge: registrationOptions.body.options.challenge as string,
          origin: 'https://localhost:8443',
        }),
        label: 'Laptop key',
      });
    expect(registerVerify.statusCode).toBe(201);
    expect(registerVerify.body).toEqual({ registered: true });

    const statusResponse = await request(app.getHttpServer())
      .get('/v1/auth/mfa/status')
      .set('Authorization', `Bearer ${initialLogin.body.accessToken as string}`);
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.body.webauthn.credentialCount).toBe(1);

    const missingMfaLogin = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'webauthn-user@local.test',
      password: 'StrongPassword!123',
    });
    expect(missingMfaLogin.statusCode).toBe(401);
    expect(missingMfaLogin.body.code).toBe('MFA_REQUIRED');
    expect(missingMfaLogin.body.methods).toContain('webauthn');
    expect(typeof missingMfaLogin.body.webauthn?.challengeToken).toBe('string');

    const invalidCredentialLogin = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'webauthn-user@local.test',
      password: 'StrongPassword!123',
      webauthnChallengeToken: missingMfaLogin.body.webauthn.challengeToken,
      webauthnCredentialId: 'invalid-credential-id',
      webauthnClientDataJson: encodeWebauthnClientData({
        type: 'webauthn.get',
        challenge: missingMfaLogin.body.webauthn.challenge as string,
        origin: 'https://localhost:8443',
      }),
    });
    expect(invalidCredentialLogin.statusCode).toBe(401);
    expect(invalidCredentialLogin.body.code).toBe('MFA_INVALID');

    const freshChallenge = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'webauthn-user@local.test',
      password: 'StrongPassword!123',
    });
    expect(freshChallenge.statusCode).toBe(401);
    expect(typeof freshChallenge.body.webauthn?.challengeToken).toBe('string');

    const invalidOriginLogin = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'webauthn-user@local.test',
      password: 'StrongPassword!123',
      webauthnChallengeToken: freshChallenge.body.webauthn.challengeToken,
      webauthnCredentialId: Buffer.from('webauthn-credential-local-12345', 'utf8').toString('base64url'),
      webauthnClientDataJson: encodeWebauthnClientData({
        type: 'webauthn.get',
        challenge: freshChallenge.body.webauthn.challenge as string,
        origin: 'https://evil.local',
      }),
    });
    expect(invalidOriginLogin.statusCode).toBe(401);
    expect(invalidOriginLogin.body.code).toBe('MFA_INVALID');

    const finalChallenge = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'webauthn-user@local.test',
      password: 'StrongPassword!123',
    });
    expect(finalChallenge.statusCode).toBe(401);
    expect(typeof finalChallenge.body.webauthn?.challengeToken).toBe('string');

    const validCredentialLogin = await request(app.getHttpServer()).post('/v1/auth/login').send({
      email: 'webauthn-user@local.test',
      password: 'StrongPassword!123',
      webauthnChallengeToken: finalChallenge.body.webauthn.challengeToken,
      webauthnCredentialId: Buffer.from('webauthn-credential-local-12345', 'utf8').toString('base64url'),
      webauthnClientDataJson: encodeWebauthnClientData({
        type: 'webauthn.get',
        challenge: finalChallenge.body.webauthn.challenge as string,
        origin: 'https://localhost:8443',
      }),
    });
    expect(validCredentialLogin.statusCode).toBe(201);
    expect(typeof validCredentialLogin.body.accessToken).toBe('string');
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
