import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { FILE_SCAN_JOB_NAME, FILE_SCAN_QUEUE_NAME } from './file-queue.contract.js';

@Injectable()
export class FileQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(FileQueueService.name);
  private connection: Redis | null = null;
  private fileScanQueue: Queue<{ fileId: string }> | null = null;

  async enqueueScan(fileId: string): Promise<void> {
    const queue = this.getQueue();
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

    await queue.add(FILE_SCAN_JOB_NAME, { fileId }, options);
    this.logger.debug(`enqueued scan job for file ${fileId}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.fileScanQueue?.close();
    this.connection?.disconnect();
  }

  private getQueue(): Queue<{ fileId: string }> {
    if (!this.connection) {
      this.connection = new Redis(this.getRedisUrl(), {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
    }

    if (!this.fileScanQueue) {
      this.fileScanQueue = new Queue(FILE_SCAN_QUEUE_NAME, {
        connection: this.connection,
      });
    }

    return this.fileScanQueue;
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
