import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class WorkerVaultTransitService {
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
