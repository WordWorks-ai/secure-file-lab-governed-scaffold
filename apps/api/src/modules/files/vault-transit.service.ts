import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * OWASP A05 – Security Misconfiguration
 *
 * Vault transit errors are logged for operators but never exposed to HTTP
 * clients. The client-facing message is a generic "Encryption service
 * unavailable" to prevent leaking internal service topology.
 */
@Injectable()
export class VaultTransitService {
  private readonly logger = new Logger(VaultTransitService.name);

  async wrapDek(plainDek: Buffer): Promise<string> {
    const keyName = this.getTransitKeyName();
    const response = await this.callVaultJson(`/v1/transit/encrypt/${encodeURIComponent(keyName)}`, {
      plaintext: plainDek.toString('base64'),
    });

    const ciphertext = response?.data?.ciphertext;
    if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
      this.logger.error('Vault transit encryption returned empty ciphertext');
      throw new ServiceUnavailableException('Encryption service unavailable');
    }

    return ciphertext;
  }

  async unwrapDek(wrappedDek: string): Promise<Buffer> {
    const keyName = this.getTransitKeyName();
    const response = await this.callVaultJson(`/v1/transit/decrypt/${encodeURIComponent(keyName)}`, {
      ciphertext: wrappedDek,
    });

    const plaintext = response?.data?.plaintext;
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
      this.logger.error('Vault transit decryption returned empty plaintext');
      throw new ServiceUnavailableException('Encryption service unavailable');
    }

    return Buffer.from(plaintext, 'base64');
  }

  private async callVaultJson(path: string, body: object): Promise<Record<string, any>> {
    const baseUrl = this.getVaultAddress();
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-vault-token': this.getVaultToken(),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // Log the real error for operators; never expose Vault details to clients.
      const text = await response.text();
      this.logger.error(`Vault transit request failed (HTTP ${response.status}): ${text}`);
      throw new ServiceUnavailableException('Encryption service unavailable');
    }

    return (await response.json()) as Record<string, any>;
  }

  private getVaultAddress(): string {
    return (process.env.VAULT_ADDR ?? 'http://vault:8200').replace(/\/+$/, '');
  }

  private getVaultToken(): string {
    const token = process.env.VAULT_DEV_ROOT_TOKEN;
    if (!token) {
      this.logger.error('VAULT_DEV_ROOT_TOKEN not configured');
      throw new ServiceUnavailableException('Encryption service unavailable');
    }

    return token;
  }

  private getTransitKeyName(): string {
    return process.env.VAULT_TRANSIT_KEY_NAME ?? 'file-dek-v1';
  }
}
