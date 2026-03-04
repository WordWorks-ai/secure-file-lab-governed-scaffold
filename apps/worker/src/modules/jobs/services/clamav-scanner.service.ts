import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Socket } from 'node:net';

@Injectable()
export class ClamavScannerService {
  async scanBuffer(buffer: Buffer): Promise<'clean' | 'infected'> {
    const host = process.env.CLAMAV_HOST ?? 'clamav';
    const port = Number(process.env.CLAMAV_PORT ?? 3310);

    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const timeoutMs = 10_000;
      const chunks: Buffer[] = [];
      let settled = false;

      const finalize = (fn: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        fn();
      };

      socket.setTimeout(timeoutMs);
      socket.once('timeout', () =>
        finalize(() => reject(new ServiceUnavailableException('ClamAV scan timed out'))),
      );
      socket.once('error', (error: Error) =>
        finalize(() => reject(new ServiceUnavailableException(`ClamAV connection failed: ${error.message}`))),
      );
      socket.on('data', (chunk) => {
        chunks.push(chunk);
      });
      socket.once('close', () => {
        if (settled) {
          return;
        }
        settled = true;
        const response = Buffer.concat(chunks).toString('utf8');
        if (response.includes('FOUND')) {
          resolve('infected');
          return;
        }

        if (response.includes('OK')) {
          resolve('clean');
          return;
        }

        reject(new ServiceUnavailableException(`Unexpected ClamAV response: ${response}`));
      });

      socket.connect(port, host, () => {
        socket.write(Buffer.from('zINSTREAM\0', 'utf8'));

        let offset = 0;
        const maxChunk = 64 * 1024;
        while (offset < buffer.length) {
          const nextOffset = Math.min(offset + maxChunk, buffer.length);
          const part = buffer.subarray(offset, nextOffset);
          const lengthPrefix = Buffer.alloc(4);
          lengthPrefix.writeUInt32BE(part.length, 0);
          socket.write(lengthPrefix);
          socket.write(part);
          offset = nextOffset;
        }

        socket.write(Buffer.alloc(4)); // Zero-length terminator
      });
    });
  }
}
