import { verify } from '@node-rs/argon2';
import { AuditActorType, AuditResult, RefreshToken, User, UserRole } from '@prisma/client';
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { AccountLockoutService } from './account-lockout.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../persistence/prisma.service.js';
import { AuthenticatedUser } from './types/authenticated-request.js';
import { JwtTokenService } from './jwt-token.service.js';
import { KeycloakSsoService } from './keycloak-sso.service.js';
import { MfaService, MfaStatus } from './mfa.service.js';

type AuthRequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

type LoginSecondFactorPayload = {
  totpCode?: string;
  webauthnChallengeToken?: string;
  webauthnCredentialId?: string;
  webauthnClientDataJson?: string;
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
  private readonly logger = new Logger(AuthService.name);

  /** OWASP A07 – Maximum concurrent refresh tokens per user (prevents token hoarding). */
  private readonly maxRefreshTokensPerUser = Number(process.env.AUTH_MAX_REFRESH_TOKENS ?? 10);

  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(JwtTokenService) private readonly jwtTokenService: JwtTokenService,
    @Inject(KeycloakSsoService) private readonly keycloakSsoService: KeycloakSsoService,
    @Inject(MfaService) private readonly mfaService: MfaService,
    @Inject(AccountLockoutService) private readonly lockoutService: AccountLockoutService,
  ) {}

  async login(
    email: string,
    password: string,
    secondFactor: LoginSecondFactorPayload,
    context: AuthRequestContext,
  ): Promise<AuthTokenResponse> {
    const normalizedEmail = email.trim().toLowerCase();

    // ── OWASP A07 – Account Lockout ───────────────────────────────────
    // Check lockout BEFORE doing any work to short-circuit brute-force.
    if (this.lockoutService.isLockedOut(normalizedEmail)) {
      const remaining = this.lockoutService.getRemainingLockoutSeconds(normalizedEmail);
      await this.auditService.recordEvent({
        action: 'auth.login',
        resourceType: 'auth_session',
        result: AuditResult.denied,
        actorType: AuditActorType.system,
        actorUserId: null,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          email: normalizedEmail,
          reason: 'account_locked',
          remainingSeconds: remaining,
        },
      });
      throw new UnauthorizedException('Account temporarily locked. Try again later.');
    }

    const user = await this.prismaService.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Always run password verification to prevent timing-based user enumeration.
    // If user doesn't exist, verify against a dummy hash so response time is constant.
    const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const passwordValid = await this.verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);
    const activeUser = Boolean(user?.isActive);

    if (!user || !passwordValid || !activeUser) {
      // Record failure for lockout tracking
      this.lockoutService.recordFailure(normalizedEmail);

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

    const mfaRequired = await this.mfaService.isMfaRequired(user.id);
    let mfaMethod: 'totp' | 'webauthn' | null = null;

    if (mfaRequired) {
      const hasTotpAttempt = Boolean(secondFactor.totpCode);
      const hasWebauthnAttempt =
        Boolean(secondFactor.webauthnChallengeToken) &&
        Boolean(secondFactor.webauthnCredentialId) &&
        Boolean(secondFactor.webauthnClientDataJson);
      const attemptedSecondFactor = hasTotpAttempt || hasWebauthnAttempt;
      let mfaVerified = false;

      if (hasTotpAttempt && secondFactor.totpCode) {
        mfaVerified = await this.mfaService.verifyTotpForLogin(user.id, secondFactor.totpCode);
        if (mfaVerified) {
          mfaMethod = 'totp';
        }
      }

      if (
        !mfaVerified &&
        hasWebauthnAttempt &&
        secondFactor.webauthnChallengeToken &&
        secondFactor.webauthnCredentialId &&
        secondFactor.webauthnClientDataJson
      ) {
        mfaVerified = await this.mfaService.verifyWebauthnAssertion({
          userId: user.id,
          challengeToken: secondFactor.webauthnChallengeToken,
          credentialId: secondFactor.webauthnCredentialId,
          clientDataJson: secondFactor.webauthnClientDataJson,
        });
        if (mfaVerified) {
          mfaMethod = 'webauthn';
        }
      }

      if (!mfaVerified) {
        const challengeCode = attemptedSecondFactor ? 'MFA_INVALID' : 'MFA_REQUIRED';
        const challenge = await this.mfaService.buildLoginChallenge(user.id, challengeCode);

        await this.auditService.recordEvent({
          action: 'auth.login.mfa.verify',
          resourceType: 'auth_session',
          result: attemptedSecondFactor ? AuditResult.denied : AuditResult.failure,
          actorType: AuditActorType.user,
          actorUserId: user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: {
            email: user.email,
            challengeCode,
            methods: challenge.methods,
          },
        });

        throw new UnauthorizedException(challenge);
      }

      await this.auditService.recordEvent({
        action: 'auth.login.mfa.verify',
        resourceType: 'auth_session',
        result: AuditResult.success,
        actorType: AuditActorType.user,
        actorUserId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          email: user.email,
          method: mfaMethod,
        },
      });
    }

    const { response } = await this.issueTokenPair(user);

    // OWASP A07 – Reset lockout counter on successful authentication.
    this.lockoutService.recordSuccess(normalizedEmail);

    // OWASP A07 – Prune stale refresh tokens to prevent token hoarding.
    await this.pruneStaleRefreshTokens(user.id);

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
        mfa: mfaMethod ?? 'none',
      },
    });

    return response;
  }

  async getMfaStatus(userId: string): Promise<MfaStatus> {
    return this.mfaService.getMfaStatus(userId);
  }

  async beginTotpEnrollment(
    user: Pick<User, 'id' | 'email'>,
    context: AuthRequestContext,
  ): Promise<{
    issuer: string;
    accountName: string;
    secret: string;
    otpauthUri: string;
  }> {
    const enrollment = await this.mfaService.beginTotpEnrollment(user.id, user.email);
    await this.auditService.recordEvent({
      action: 'auth.mfa.totp.enroll',
      resourceType: 'auth_mfa',
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        method: 'totp',
      },
    });
    return enrollment;
  }

  async verifyTotpEnrollment(
    user: Pick<User, 'id'>,
    code: string,
    context: AuthRequestContext,
  ): Promise<{ enabled: true }> {
    const verified = await this.mfaService.verifyTotpEnrollment(user.id, code);
    if (!verified) {
      await this.auditService.recordEvent({
        action: 'auth.mfa.totp.verify',
        resourceType: 'auth_mfa',
        result: AuditResult.denied,
        actorType: AuditActorType.user,
        actorUserId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          reason: 'invalid_code',
        },
      });
      throw new UnauthorizedException('Invalid TOTP code');
    }

    await this.auditService.recordEvent({
      action: 'auth.mfa.totp.verify',
      resourceType: 'auth_mfa',
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        method: 'totp',
      },
    });

    return { enabled: true };
  }

  async disableTotp(user: Pick<User, 'id'>, context: AuthRequestContext): Promise<{ disabled: true }> {
    await this.mfaService.disableTotp(user.id);
    await this.auditService.recordEvent({
      action: 'auth.mfa.totp.disable',
      resourceType: 'auth_mfa',
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        method: 'totp',
      },
    });
    return { disabled: true };
  }

  async beginWebauthnRegistration(
    user: Pick<User, 'id' | 'email'>,
    context: AuthRequestContext,
  ): Promise<{
    challengeToken: string;
    options: {
      challenge: string;
      rp: {
        name: string;
        id: string;
      };
      user: {
        id: string;
        name: string;
        displayName: string;
      };
      timeout: number;
      pubKeyCredParams: Array<{
        type: 'public-key';
        alg: number;
      }>;
    };
  }> {
    const registration = await this.mfaService.beginWebauthnRegistration(user.id, user.email);
    await this.auditService.recordEvent({
      action: 'auth.mfa.webauthn.register.options',
      resourceType: 'auth_mfa',
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        method: 'webauthn',
      },
    });
    return registration;
  }

  async finishWebauthnRegistration(
    user: Pick<User, 'id'>,
    payload: {
      challengeToken: string;
      credentialId: string;
      clientDataJson: string;
      label?: string;
      publicKey?: string;
    },
    context: AuthRequestContext,
  ): Promise<{ registered: true }> {
    const registered = await this.mfaService.finishWebauthnRegistration({
      userId: user.id,
      challengeToken: payload.challengeToken,
      credentialId: payload.credentialId,
      clientDataJson: payload.clientDataJson,
      label: payload.label,
      publicKey: payload.publicKey,
    });

    if (!registered) {
      await this.auditService.recordEvent({
        action: 'auth.mfa.webauthn.register.verify',
        resourceType: 'auth_mfa',
        result: AuditResult.denied,
        actorType: AuditActorType.user,
        actorUserId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          reason: 'invalid_registration_payload',
        },
      });
      throw new UnauthorizedException('Invalid WebAuthn registration payload');
    }

    await this.auditService.recordEvent({
      action: 'auth.mfa.webauthn.register.verify',
      resourceType: 'auth_mfa',
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        method: 'webauthn',
      },
    });

    return { registered: true };
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

  async exchangeSsoAccessToken(
    accessToken: string,
    context: AuthRequestContext,
  ): Promise<AuthTokenResponse> {
    const identity = await this.keycloakSsoService.getIdentityFromAccessToken(accessToken);
    const user = await this.resolveSsoUser(identity.email, identity.roles);

    if (!user.isActive) {
      await this.auditService.recordEvent({
        action: 'auth.sso.exchange',
        resourceType: 'auth_session',
        result: AuditResult.denied,
        actorType: AuditActorType.user,
        actorUserId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          reason: 'user_inactive',
          email: user.email,
        },
      });
      throw new UnauthorizedException('SSO account is inactive');
    }

    const { response } = await this.issueTokenPair(user);
    await this.auditService.recordEvent({
      action: 'auth.sso.exchange',
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

  private async resolveSsoUser(email: string, roles: string[]): Promise<User> {
    const existing = await this.prismaService.user.findUnique({
      where: { email },
    });
    if (existing) {
      return existing;
    }

    const mappedRole = roles.map((value) => value.toLowerCase()).includes('admin')
      ? UserRole.admin
      : UserRole.member;

    return this.prismaService.user.create({
      data: {
        email,
        passwordHash: `sso-only:${randomBytes(32).toString('base64url')}`,
        role: mappedRole,
        isActive: true,
      },
    });
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

  /**
   * OWASP A07 – Prune expired or excess refresh tokens for a user.
   *
   * Revokes all expired tokens and, if the user still exceeds the maximum
   * allowed concurrent refresh tokens, revokes the oldest surplus.
   */
  private async pruneStaleRefreshTokens(userId: string): Promise<void> {
    try {
      // 1. Revoke all expired tokens
      await this.prismaService.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { lte: new Date() },
        },
        data: { revokedAt: new Date() },
      });

      // 2. Count remaining active tokens
      const activeTokens = await this.prismaService.refreshToken.findMany({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { issuedAt: 'desc' },
        select: { id: true },
      });

      if (activeTokens.length > this.maxRefreshTokensPerUser) {
        const surplus = activeTokens.slice(this.maxRefreshTokensPerUser);
        await this.prismaService.refreshToken.updateMany({
          where: {
            id: { in: surplus.map((t) => t.id) },
          },
          data: { revokedAt: new Date() },
        });

        this.logger.log(`Pruned ${surplus.length} excess refresh tokens for user ${userId}`);
      }
    } catch (error) {
      // Non-critical – log and continue. Login should not fail because of cleanup.
      this.logger.warn(
        `Refresh token cleanup failed for user ${userId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
