import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async checkConnection(timeoutMs = 1000): Promise<boolean> {
    try {
      await this.withTimeout(this.$queryRaw`SELECT 1`, timeoutMs);
      return true;
    } catch {
      return false;
    }
  }

  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Prisma operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}
