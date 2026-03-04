import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

type KeycloakUserInfoResponse = {
  sub?: unknown;
  email?: unknown;
  preferred_username?: unknown;
  realm_access?: unknown;
};

export type KeycloakIdentity = {
  subject: string;
  email: string;
  preferredUsername: string | null;
  roles: string[];
};

@Injectable()
export class KeycloakSsoService {
  isEnabled(): boolean {
    return this.readBooleanEnv('KEYCLOAK_SSO_ENABLED', false);
  }

  async getIdentityFromAccessToken(accessToken: string): Promise<KeycloakIdentity> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('SSO is not enabled');
    }

    const response = await this.fetchUserInfo(accessToken);
    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedException('Invalid SSO access token');
    }

    if (!response.ok) {
      throw new ServiceUnavailableException('SSO provider unavailable');
    }

    const payload = (await response.json()) as KeycloakUserInfoResponse;
    const subject = typeof payload.sub === 'string' ? payload.sub : null;
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
    const preferredUsername =
      typeof payload.preferred_username === 'string'
        ? payload.preferred_username
        : null;

    if (!subject || !email) {
      throw new UnauthorizedException('SSO user profile is incomplete');
    }

    return {
      subject,
      email,
      preferredUsername,
      roles: this.extractRoles(payload.realm_access),
    };
  }

  private async fetchUserInfo(accessToken: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutMs = this.getTimeoutMs();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(this.getUserInfoEndpoint(), {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      });
    } catch {
      throw new ServiceUnavailableException('SSO provider unavailable');
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private extractRoles(realmAccess: unknown): string[] {
    if (!realmAccess || typeof realmAccess !== 'object') {
      return [];
    }

    const roles = (realmAccess as { roles?: unknown }).roles;
    if (!Array.isArray(roles)) {
      return [];
    }

    return roles.filter((value): value is string => typeof value === 'string');
  }

  private getUserInfoEndpoint(): string {
    const baseUrl = (process.env.KEYCLOAK_BASE_URL ?? 'http://keycloak:8080').replace(/\/+$/, '');
    const realm = process.env.KEYCLOAK_REALM ?? 'master';
    return `${baseUrl}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/userinfo`;
  }

  private getTimeoutMs(): number {
    const raw = Number(process.env.KEYCLOAK_TIMEOUT_MS ?? 5000);
    if (Number.isFinite(raw) && raw > 0) {
      return Math.floor(raw);
    }

    return 5000;
  }

  private readBooleanEnv(name: string, defaultValue: boolean): boolean {
    const value = process.env[name];
    if (!value) {
      return defaultValue;
    }

    return value.trim().toLowerCase() === 'true';
  }
}
