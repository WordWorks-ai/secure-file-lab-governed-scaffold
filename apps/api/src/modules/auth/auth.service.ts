import { verify } from '@node-rs/argon2';
import { AuditActorType, AuditResult, RefreshToken, User, UserRole } from '@prisma/client';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../persistence/prisma.service.js';
import { AuthenticatedUser } from './types/authenticated-request.js';
import { JwtTokenService } from './jwt-token.service.js';

type AuthRequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type AuthTokenResponse = {
  tokenType: 'Bearer';
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(JwtTokenService) private readonly jwtTokenService: JwtTokenService,
  ) {}

  async login(
    email: string,
    password: string,
    context: AuthRequestContext,
  ): Promise<AuthTokenResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prismaService.user.findUnique({
      where: { email: normalizedEmail },
    });

    const passwordValid = user ? await this.verifyPassword(user.passwordHash, password) : false;
    const activeUser = Boolean(user?.isActive);

    if (!user || !passwordValid || !activeUser) {
      await this.auditService.recordEvent({
        action: 'auth.login',
        resourceType: 'auth_session',
        result: AuditResult.failure,
        actorType: user ? AuditActorType.user : AuditActorType.system,
        actorUserId: user?.id ?? null,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          email: normalizedEmail,
          reason: !user ? 'user_not_found' : !passwordValid ? 'invalid_password' : 'user_inactive',
        },
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    const { response } = await this.issueTokenPair(user);

    await this.auditService.recordEvent({
      action: 'auth.login',
      resourceType: 'auth_session',
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        email: user.email,
      },
    });

    return response;
  }

  async refresh(refreshToken: string, context: AuthRequestContext): Promise<AuthTokenResponse> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const existingToken = await this.prismaService.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existingToken || !existingToken.user) {
      await this.auditService.recordEvent({
        action: 'auth.refresh',
        resourceType: 'auth_session',
        result: AuditResult.failure,
        actorType: AuditActorType.system,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          reason: 'token_not_found',
        },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!this.isRefreshTokenUsable(existingToken) || !existingToken.user.isActive) {
      await this.auditService.recordEvent({
        action: 'auth.refresh',
        resourceType: 'auth_session',
        result: AuditResult.denied,
        actorType: AuditActorType.user,
        actorUserId: existingToken.user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          reason: !existingToken.user.isActive ? 'user_inactive' : 'token_revoked_or_expired',
        },
      });
      throw new UnauthorizedException('Refresh token is not valid');
    }

    const { refreshTokenRecord, response } = await this.issueTokenPair(
      existingToken.user,
      existingToken.id,
    );

    await this.prismaService.refreshToken.update({
      where: { id: existingToken.id },
      data: {
        revokedAt: new Date(),
        replacedByTokenId: refreshTokenRecord.id,
      },
    });

    await this.auditService.recordEvent({
      action: 'auth.refresh',
      resourceType: 'auth_session',
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: existingToken.user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return response;
  }

  async logout(refreshToken: string, context: AuthRequestContext): Promise<{ success: true }> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const existingToken = await this.prismaService.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    await this.prismaService.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    await this.auditService.recordEvent({
      action: 'auth.logout',
      resourceType: 'auth_session',
      result: existingToken ? AuditResult.success : AuditResult.denied,
      actorType: existingToken ? AuditActorType.user : AuditActorType.system,
      actorUserId: existingToken?.user.id ?? null,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: existingToken ? {} : { reason: 'token_not_found' },
    });

    return { success: true };
  }

  getAuthenticatedUser(accessToken: string): AuthenticatedUser {
    return this.jwtTokenService.verifyAccessToken(accessToken);
  }

  private async issueTokenPair(
    user: Pick<User, 'id' | 'email' | 'role'>,
    rotatedFromTokenId?: string,
  ): Promise<{ refreshTokenRecord: RefreshToken; response: AuthTokenResponse }> {
    const refreshToken = this.generateRefreshToken();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const refreshTtlSeconds = this.getRefreshTtlSeconds();
    const now = new Date();
    const refreshTokenRecord = await this.prismaService.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        issuedAt: now,
        expiresAt: new Date(now.getTime() + refreshTtlSeconds * 1000),
        rotatedFromTokenId: rotatedFromTokenId ?? null,
      },
    });

    const accessToken = this.jwtTokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      refreshTokenRecord,
      response: {
        tokenType: 'Bearer',
        accessToken,
        accessTokenExpiresIn: this.jwtTokenService.getAccessTokenTtlSeconds(),
        refreshToken,
        refreshTokenExpiresIn: refreshTtlSeconds,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      },
    };
  }

  private async verifyPassword(encodedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(encodedHash, password);
    } catch {
      return false;
    }
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private getRefreshTtlSeconds(): number {
    const raw = Number(process.env.JWT_REFRESH_TTL ?? 1209600);
    if (Number.isFinite(raw) && raw > 0) {
      return Math.floor(raw);
    }

    return 1209600;
  }

  private isRefreshTokenUsable(token: Pick<RefreshToken, 'revokedAt' | 'replacedByTokenId' | 'expiresAt'>): boolean {
    if (token.revokedAt || token.replacedByTokenId) {
      return false;
    }

    return token.expiresAt.getTime() > Date.now();
  }
}
