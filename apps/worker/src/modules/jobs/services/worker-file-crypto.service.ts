import { Injectable } from '@nestjs/common';
import { createDecipheriv } from 'node:crypto';

@Injectable()
export class WorkerFileCryptoService {
  decrypt(ciphertext: Buffer, dek: Buffer, iv: Buffer, tag: Buffer): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
