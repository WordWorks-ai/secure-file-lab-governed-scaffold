import { Injectable } from '@nestjs/common';
import { Socket } from 'node:net';

type DependencyStatus = {
  name: string;
  ok: boolean;
};

@Injectable()
export class DependencyHealthService {
  private readonly timeoutMs = 1000;

  async checkAll(): Promise<{ ok: boolean; dependencies: DependencyStatus[] }> {
    const dependencies = await Promise.all([
      this.checkTcp('postgres', process.env.POSTGRES_HOST ?? 'postgres', Number(process.env.POSTGRES_PORT ?? 5432)),
      this.checkTcp('redis', process.env.REDIS_HOST ?? 'redis', Number(process.env.REDIS_PORT ?? 6379)),
      this.checkTcp('minio', process.env.MINIO_HOST ?? 'minio', Number(process.env.MINIO_PORT ?? 9000)),
      this.checkTcp('vault', process.env.VAULT_HOST ?? 'vault', Number(process.env.VAULT_PORT ?? 8200)),
      this.checkTcp('clamav', process.env.CLAMAV_HOST ?? 'clamav', Number(process.env.CLAMAV_PORT ?? 3310)),
    ]);

    return {
      ok: dependencies.every((dependency) => dependency.ok),
      dependencies,
    };
  }

  private checkTcp(name: string, host: string, port: number): Promise<DependencyStatus> {
    return new Promise((resolve) => {
      const socket = new Socket();

      const finalize = (ok: boolean): void => {
        socket.destroy();
        resolve({ name, ok });
      };

      socket.setTimeout(this.timeoutMs);
      socket.once('connect', () => finalize(true));
      socket.once('timeout', () => finalize(false));
      socket.once('error', () => finalize(false));

      socket.connect(port, host);
    });
  }
}
