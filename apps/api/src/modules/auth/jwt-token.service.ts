import { UserRole } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { AuthenticatedUser } from './types/authenticated-request.js';

type AccessTokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

type JwtHeader = {
  alg: 'HS256';
  typ: 'JWT';
};

type JwtClaims = AuthenticatedUser;

@Injectable()
export class JwtTokenService {
  signAccessToken(payload: AccessTokenPayload): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const claims: JwtClaims = {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      type: 'access',
      iat: nowSeconds,
      exp: nowSeconds + this.getAccessTokenTtlSeconds(),
    };

    return this.sign(claims, this.getAccessTokenSecret());
  }

  verifyAccessToken(token: string): AuthenticatedUser {
    const claims = this.verify(token, this.getAccessTokenSecret());

    if (claims.type !== 'access') {
      throw new Error('invalid token type');
    }

    return claims;
  }

  getAccessTokenTtlSeconds(): number {
    const raw = Number(process.env.JWT_ACCESS_TTL ?? 900);
    if (Number.isFinite(raw) && raw > 0) {
      return Math.floor(raw);
    }

    return 900;
  }

  private sign(claims: JwtClaims, secret: string): string {
    const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = this.encodeJson(header);
    const encodedClaims = this.encodeJson(claims);
    const message = `${encodedHeader}.${encodedClaims}`;
    const signature = this.signMessage(message, secret);

    return `${message}.${signature}`;
  }

  private verify(token: string, secret: string): JwtClaims {
    const segments = token.split('.');
    if (segments.length !== 3) {
      throw new Error('invalid token format');
    }

    const [encodedHeader, encodedClaims, providedSignature] = segments;
    const message = `${encodedHeader}.${encodedClaims}`;
    const expectedSignature = this.signMessage(message, secret);
    const providedBuffer = Buffer.from(providedSignature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new Error('invalid token signature');
    }

    const claims = this.decodeJson<Partial<JwtClaims>>(encodedClaims);
    if (
      typeof claims.sub !== 'string' ||
      typeof claims.email !== 'string' ||
      (claims.role !== UserRole.admin && claims.role !== UserRole.member) ||
      claims.type !== 'access' ||
      typeof claims.iat !== 'number' ||
      typeof claims.exp !== 'number'
    ) {
      throw new Error('invalid token claims');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (claims.exp <= nowSeconds) {
      throw new Error('token expired');
    }

    return claims as JwtClaims;
  }

  private signMessage(message: string, secret: string): string {
    return createHmac('sha256', secret).update(message).digest('base64url');
  }

  private encodeJson(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private decodeJson<T>(encodedValue: string): T {
    const json = Buffer.from(encodedValue, 'base64url').toString('utf8');
    return JSON.parse(json) as T;
  }

  private getAccessTokenSecret(): string {
    return process.env.JWT_ACCESS_SECRET ?? 'local-dev-insecure-access-secret';
  }
}
