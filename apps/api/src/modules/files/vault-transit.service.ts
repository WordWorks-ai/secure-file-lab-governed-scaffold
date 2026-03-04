import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class VaultTransitService {
  async wrapDek(plainDek: Buffer): Promise<string> {
    const keyName = this.getTransitKeyName();
    const response = await this.callVaultJson(`/v1/transit/encrypt/${encodeURIComponent(keyName)}`, {
      plaintext: plainDek.toString('base64'),
    });

    const ciphertext = response?.data?.ciphertext;
    if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
      throw new ServiceUnavailableException('Vault transit encryption did not return ciphertext');
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
      throw new ServiceUnavailableException('Vault transit decryption did not return plaintext');
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
      const text = await response.text();
      throw new ServiceUnavailableException(`Vault transit request failed (${response.status}): ${text}`);
    }

    return (await response.json()) as Record<string, any>;
  }

  private getVaultAddress(): string {
    return (process.env.VAULT_ADDR ?? 'http://vault:8200').replace(/\/+$/, '');
  }

  private getVaultToken(): string {
    const token = process.env.VAULT_DEV_ROOT_TOKEN;
    if (!token) {
      throw new ServiceUnavailableException('VAULT_DEV_ROOT_TOKEN is required for transit operations');
    }

    return token;
  }

  private getTransitKeyName(): string {
    return process.env.VAULT_TRANSIT_KEY_NAME ?? 'file-dek-v1';
  }
}
