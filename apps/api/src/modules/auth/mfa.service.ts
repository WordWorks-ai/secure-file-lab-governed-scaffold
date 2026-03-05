import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, createHash, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../persistence/prisma.service.js';

type ChallengeMode = 'registration' | 'assertion';

type StoredChallenge = {
  mode: ChallengeMode;
  userId: string;
  challenge: string;
  expiresAtMs: number;
};

export type LoginMfaChallenge = {
  code: 'MFA_REQUIRED' | 'MFA_INVALID';
  methods: Array<'totp' | 'webauthn'>;
  webauthn: {
    challengeToken: string;
    challenge: string;
    timeoutMs: number;
    rpId: string;
    allowCredentials: Array<{ id: string; type: 'public-key' }>;
  } | null;
};

export type MfaStatus = {
  totp: {
    enrolled: boolean;
    enabled: boolean;
  };
  webauthn: {
    credentialCount: number;
  };
};

@Injectable()
export class MfaService {
  private readonly challenges = new Map<string, StoredChallenge>();

  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  async isMfaRequired(userId: string): Promise<boolean> {
    const status = await this.getMfaStatus(userId);
    return status.totp.enabled || status.webauthn.credentialCount > 0;
  }

  async getMfaStatus(userId: string): Promise<MfaStatus> {
    const totpFactor = await this.prismaService.userMfaTotpFactor?.findUnique?.({
      where: { userId },
    });
    const webauthnCredentials = await this.prismaService.userWebauthnCredential?.findMany?.({
      where: { userId },
    });

    return {
      totp: {
        enrolled: Boolean(totpFactor),
        enabled: Boolean(totpFactor?.isEnabled),
      },
      webauthn: {
        credentialCount: webauthnCredentials?.length ?? 0,
      },
    };
  }

  async beginTotpEnrollment(userId: string, email: string): Promise<{
    issuer: string;
    accountName: string;
    secret: string;
    otpauthUri: string;
  }> {
    const issuer = this.getTotpIssuer();
    const accountName = email.trim().toLowerCase();
    const secret = this.generateTotpSecret();
    const secretEnvelope = this.encryptSecret(secret);

    await this.prismaService.userMfaTotpFactor?.upsert?.({
      where: { userId },
      create: {
        userId,
        secretEnvelope,
        isEnabled: false,
        verifiedAt: null,
      },
      update: {
        secretEnvelope,
        isEnabled: false,
        verifiedAt: null,
      },
    });

    const otpauthUri = this.buildOtpAuthUri({
      issuer,
      accountName,
      secret,
    });

    return {
      issuer,
      accountName,
      secret,
      otpauthUri,
    };
  }

  async verifyTotpEnrollment(userId: string, code: string): Promise<boolean> {
    const factor = await this.prismaService.userMfaTotpFactor?.findUnique?.({
      where: { userId },
    });
    if (!factor) {
      return false;
    }

    const secret = this.decryptSecret(factor.secretEnvelope);
    const valid = this.verifyTotpCode(secret, code);
    if (!valid) {
      return false;
    }

    await this.prismaService.userMfaTotpFactor?.update?.({
      where: { userId },
      data: {
        isEnabled: true,
        verifiedAt: new Date(),
      },
    });

    return true;
  }

  async disableTotp(userId: string): Promise<void> {
    const existing = await this.prismaService.userMfaTotpFactor?.findUnique?.({
      where: { userId },
    });
    if (!existing) {
      return;
    }
    await this.prismaService.userMfaTotpFactor?.delete?.({
      where: { userId },
    });
  }

  async verifyTotpForLogin(userId: string, code: string): Promise<boolean> {
    const factor = await this.prismaService.userMfaTotpFactor?.findUnique?.({
      where: { userId },
    });
    if (!factor?.isEnabled) {
      return false;
    }
    const secret = this.decryptSecret(factor.secretEnvelope);
    return this.verifyTotpCode(secret, code);
  }

  async beginWebauthnRegistration(userId: string, email: string): Promise<{
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
    this.pruneExpiredChallenges();
    const challenge = this.generateChallenge();
    const challengeToken = this.generateChallengeToken({
      mode: 'registration',
      userId,
      challenge,
    });

    const rpId = this.getWebauthnRpId();
    const rpName = this.getWebauthnRpName();
    const timeoutMs = this.getWebauthnChallengeTtlMs();

    return {
      challengeToken,
      options: {
        challenge,
        rp: {
          id: rpId,
          name: rpName,
        },
        user: {
          id: userId,
          name: email.toLowerCase(),
          displayName: email.toLowerCase(),
        },
        timeout: timeoutMs,
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
      },
    };
  }

  async finishWebauthnRegistration(params: {
    userId: string;
    challengeToken: string;
    credentialId: string;
    clientDataJson: string;
    label?: string | null;
    publicKey?: string | null;
  }): Promise<boolean> {
    const challenge = this.consumeChallenge(params.challengeToken, 'registration', params.userId);
    if (!challenge) {
      return false;
    }

    const normalizedCredentialId = params.credentialId.trim();
    if (!this.isValidWebauthnCredentialId(normalizedCredentialId)) {
      return false;
    }

    const registrationClientDataValid = this.validateWebauthnClientData({
      encodedClientData: params.clientDataJson,
      expectedType: 'webauthn.create',
      expectedChallenge: challenge.challenge,
    });
    if (!registrationClientDataValid) {
      return false;
    }

    const existing = await this.prismaService.userWebauthnCredential?.findUnique?.({
      where: { credentialId: normalizedCredentialId },
    });

    if (existing && existing.userId !== params.userId) {
      return false;
    }

    if (existing) {
      await this.prismaService.userWebauthnCredential?.update?.({
        where: { id: existing.id },
        data: {
          label: params.label?.trim() || null,
          publicKey: params.publicKey?.trim() || null,
          lastUsedAt: null,
        },
      });
      return true;
    }

    await this.prismaService.userWebauthnCredential?.create?.({
        data: {
          userId: params.userId,
          credentialId: normalizedCredentialId,
          label: params.label?.trim() || null,
          publicKey: params.publicKey?.trim() || null,
        },
    });

    return true;
  }

  async buildLoginChallenge(userId: string, failureCode: 'MFA_REQUIRED' | 'MFA_INVALID'): Promise<LoginMfaChallenge> {
    const status = await this.getMfaStatus(userId);
    const methods: Array<'totp' | 'webauthn'> = [];

    if (status.totp.enabled) {
      methods.push('totp');
    }

    const credentials = await this.prismaService.userWebauthnCredential?.findMany?.({
      where: { userId },
    });
    const allowCredentials = (credentials ?? []).map((credential) => ({
      id: credential.credentialId,
      type: 'public-key' as const,
    }));

    if (allowCredentials.length > 0) {
      methods.push('webauthn');
    }

    if (methods.length === 0) {
      return {
        code: failureCode,
        methods,
        webauthn: null,
      };
    }

    if (allowCredentials.length === 0) {
      return {
        code: failureCode,
        methods,
        webauthn: null,
      };
    }

    const challenge = this.generateChallenge();
    const challengeToken = this.generateChallengeToken({
      mode: 'assertion',
      userId,
      challenge,
    });

    return {
      code: failureCode,
      methods,
      webauthn: {
        challengeToken,
        challenge,
        timeoutMs: this.getWebauthnChallengeTtlMs(),
        rpId: this.getWebauthnRpId(),
        allowCredentials,
      },
    };
  }

  async verifyWebauthnAssertion(params: {
    userId: string;
    challengeToken: string;
    credentialId: string;
    clientDataJson: string;
  }): Promise<boolean> {
    const challenge = this.consumeChallenge(params.challengeToken, 'assertion', params.userId);
    if (!challenge) {
      return false;
    }

    const normalizedCredentialId = params.credentialId.trim();
    if (!this.isValidWebauthnCredentialId(normalizedCredentialId)) {
      return false;
    }

    const assertionClientDataValid = this.validateWebauthnClientData({
      encodedClientData: params.clientDataJson,
      expectedType: 'webauthn.get',
      expectedChallenge: challenge.challenge,
    });
    if (!assertionClientDataValid) {
      return false;
    }

    const credential = await this.prismaService.userWebauthnCredential?.findFirst?.({
      where: {
        userId: params.userId,
        credentialId: normalizedCredentialId,
      },
    });

    if (!credential) {
      return false;
    }

    await this.prismaService.userWebauthnCredential?.update?.({
      where: { id: credential.id },
      data: {
        lastUsedAt: new Date(),
      },
    });

    return true;
  }

  private getTotpIssuer(): string {
    const value = (process.env.MFA_TOTP_ISSUER ?? 'Schwass Secure File Lab').trim();
    return value.length > 0 ? value : 'Schwass Secure File Lab';
  }

  private getWebauthnRpId(): string {
    const value = (process.env.MFA_WEBAUTHN_RP_ID ?? 'localhost').trim();
    return value.length > 0 ? value : 'localhost';
  }

  private getWebauthnRpName(): string {
    const value = (process.env.MFA_WEBAUTHN_RP_NAME ?? 'Schwass Secure File Lab').trim();
    return value.length > 0 ? value : 'Schwass Secure File Lab';
  }

  private getWebauthnChallengeTtlMs(): number {
    const raw = Number(process.env.MFA_WEBAUTHN_CHALLENGE_TTL_SECONDS ?? 120);
    if (Number.isFinite(raw) && raw >= 15 && raw <= 600) {
      return Math.floor(raw * 1000);
    }
    return 120_000;
  }

  private getWebauthnAllowedOrigins(): Set<string> {
    const configured = process.env.MFA_WEBAUTHN_ALLOWED_ORIGINS;
    const defaults = ['https://localhost:8443', 'http://localhost:8080'];
    const candidates = configured
      ? configured
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      : defaults;

    const normalized = candidates
      .map((origin) => this.normalizeOrigin(origin))
      .filter((origin) => origin.length > 0);
    if (normalized.length === 0) {
      return new Set(defaults.map((origin) => this.normalizeOrigin(origin)));
    }

    return new Set(normalized);
  }

  private getTotpEncryptionKey(): Buffer {
    const material = (process.env.MFA_TOTP_SECRET_KEY ?? process.env.JWT_ACCESS_SECRET ?? 'dev-mfa-secret')
      .trim();
    return createHash('sha256').update(material).digest();
  }

  private encryptSecret(secret: string): string {
    const iv = randomBytes(12);
    const key = this.getTotpEncryptionKey();
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
  }

  private decryptSecret(secretEnvelope: string): string {
    if (!secretEnvelope.startsWith('v1.')) {
      return secretEnvelope;
    }

    const [, ivEncoded, tagEncoded, ciphertextEncoded] = secretEnvelope.split('.');
    if (!ivEncoded || !tagEncoded || !ciphertextEncoded) {
      throw new Error('invalid secret envelope');
    }

    const iv = Buffer.from(ivEncoded, 'base64url');
    const tag = Buffer.from(tagEncoded, 'base64url');
    const ciphertext = Buffer.from(ciphertextEncoded, 'base64url');
    const key = this.getTotpEncryptionKey();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }

  private generateTotpSecret(): string {
    return this.base32Encode(randomBytes(20));
  }

  private verifyTotpCode(secret: string, code: string): boolean {
    const normalized = code.trim();
    if (!/^\d{6}$/.test(normalized)) {
      return false;
    }

    const currentCounter = Math.floor(Date.now() / 1000 / 30);
    for (let offset = -1; offset <= 1; offset += 1) {
      const expected = this.generateHotp(secret, currentCounter + offset);
      if (this.safeCompare(expected, normalized)) {
        return true;
      }
    }

    return false;
  }

  private buildOtpAuthUri(params: { issuer: string; accountName: string; secret: string }): string {
    const label = encodeURIComponent(`${params.issuer}:${params.accountName}`);
    const issuer = encodeURIComponent(params.issuer);
    return `otpauth://totp/${label}?secret=${params.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  }

  private generateHotp(secretBase32: string, counter: number): string {
    const key = this.base32Decode(secretBase32);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter), 0);
    const hmac = createHmac('sha1', key).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binaryCode =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    const otp = binaryCode % 1_000_000;
    return otp.toString().padStart(6, '0');
  }

  private base32Encode(input: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of input) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }

    return output;
  }

  private base32Decode(input: string): Buffer {
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

  private safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  private isValidWebauthnCredentialId(value: string): boolean {
    return /^[A-Za-z0-9_-]{16,1024}$/.test(value);
  }

  private validateWebauthnClientData(params: {
    encodedClientData: string;
    expectedType: 'webauthn.create' | 'webauthn.get';
    expectedChallenge: string;
  }): boolean {
    const parsed = this.parseWebauthnClientData(params.encodedClientData);
    if (!parsed) {
      return false;
    }

    if (parsed.type !== params.expectedType) {
      return false;
    }

    if (!this.safeCompare(parsed.challenge, params.expectedChallenge)) {
      return false;
    }

    const allowedOrigins = this.getWebauthnAllowedOrigins();
    const normalizedOrigin = this.normalizeOrigin(parsed.origin);
    return allowedOrigins.has(normalizedOrigin);
  }

  private parseWebauthnClientData(encodedClientData: string): {
    type: string;
    challenge: string;
    origin: string;
  } | null {
    const normalized = encodedClientData.trim();
    if (normalized.length < 16 || normalized.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
      return null;
    }

    try {
      const decoded = Buffer.from(normalized, 'base64url').toString('utf8');
      const parsed = JSON.parse(decoded) as {
        type?: unknown;
        challenge?: unknown;
        origin?: unknown;
      };
      if (
        typeof parsed.type !== 'string' ||
        typeof parsed.challenge !== 'string' ||
        typeof parsed.origin !== 'string'
      ) {
        return null;
      }

      if (
        parsed.type.length === 0 ||
        parsed.type.length > 64 ||
        parsed.challenge.length < 16 ||
        parsed.challenge.length > 256 ||
        parsed.origin.length < 8 ||
        parsed.origin.length > 512
      ) {
        return null;
      }

      return {
        type: parsed.type,
        challenge: parsed.challenge,
        origin: parsed.origin,
      };
    } catch {
      return null;
    }
  }

  private normalizeOrigin(origin: string): string {
    const trimmed = origin.trim().toLowerCase();
    if (trimmed.endsWith('/')) {
      return trimmed.slice(0, -1);
    }
    return trimmed;
  }

  private generateChallenge(): string {
    return randomBytes(32).toString('base64url');
  }

  private generateChallengeToken(params: { mode: ChallengeMode; userId: string; challenge: string }): string {
    this.pruneExpiredChallenges();
    const token = randomBytes(32).toString('base64url');
    this.challenges.set(token, {
      mode: params.mode,
      userId: params.userId,
      challenge: params.challenge,
      expiresAtMs: Date.now() + this.getWebauthnChallengeTtlMs(),
    });
    return token;
  }

  private consumeChallenge(token: string, mode: ChallengeMode, userId: string): StoredChallenge | null {
    this.pruneExpiredChallenges();
    const challenge = this.challenges.get(token);
    if (!challenge) {
      return null;
    }

    this.challenges.delete(token);

    if (challenge.mode !== mode || challenge.userId !== userId || challenge.expiresAtMs < Date.now()) {
      return null;
    }

    return challenge;
  }

  private pruneExpiredChallenges(): void {
    const now = Date.now();
    for (const [token, challenge] of this.challenges.entries()) {
      if (challenge.expiresAtMs <= now) {
        this.challenges.delete(token);
      }
    }
  }
}
