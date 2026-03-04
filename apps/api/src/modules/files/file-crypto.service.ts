import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class FileCryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 12;

  generateDek(): Buffer {
    return randomBytes(32);
  }

  encrypt(plaintext: Buffer, dek: Buffer): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv(this.algorithm, dek, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return { ciphertext, iv, tag };
  }

  decrypt(ciphertext: Buffer, dek: Buffer, iv: Buffer, tag: Buffer): Buffer {
    const decipher = createDecipheriv(this.algorithm, dek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
