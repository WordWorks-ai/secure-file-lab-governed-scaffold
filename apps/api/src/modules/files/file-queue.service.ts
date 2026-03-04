import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { FILE_SCAN_JOB_NAME, FILE_SCAN_QUEUE_NAME } from './file-queue.contract.js';

@Injectable()
export class FileQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(FileQueueService.name);
  private readonly connection = new Redis(this.getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  private readonly fileScanQueue = new Queue(FILE_SCAN_QUEUE_NAME, {
    connection: this.connection,
  });

  async enqueueScan(fileId: string): Promise<void> {
    const options: JobsOptions = {
      jobId: `scan:${fileId}`,
      attempts: this.getScanAttempts(),
      backoff: {
        type: 'exponential',
        delay: 2_000,
      },
      removeOnComplete: 500,
      removeOnFail: 2_000,
    };

    await this.fileScanQueue.add(FILE_SCAN_JOB_NAME, { fileId }, options);
    this.logger.debug(`enqueued scan job for file ${fileId}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.fileScanQueue.close();
    this.connection.disconnect();
  }

  private getScanAttempts(): number {
    const raw = Number(process.env.FILE_SCAN_JOB_ATTEMPTS ?? 3);
    if (Number.isFinite(raw) && raw >= 1) {
      return Math.floor(raw);
    }

    return 3;
  }

  private getRedisUrl(): string {
    return process.env.REDIS_URL ?? 'redis://redis:6379';
  }
}
