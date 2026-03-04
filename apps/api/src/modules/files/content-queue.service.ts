import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { CONTENT_PROCESS_JOB_NAME, CONTENT_PROCESS_QUEUE_NAME } from './content-queue.contract.js';

@Injectable()
export class ContentQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ContentQueueService.name);
  private connection: Redis | null = null;
  private queue: Queue<{ fileId: string }> | null = null;

  async enqueue(fileId: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const queue = this.getQueue();
    const options: JobsOptions = {
      jobId: `content:${fileId}`,
      attempts: this.getAttempts(),
      backoff: {
        type: 'exponential',
        delay: 2_000,
      },
      removeOnComplete: 1_000,
      removeOnFail: 4_000,
    };

    await queue.add(CONTENT_PROCESS_JOB_NAME, { fileId }, options);
    this.logger.debug(`enqueued content processing for file ${fileId}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    this.connection?.disconnect();
  }

  private getQueue(): Queue<{ fileId: string }> {
    if (!this.connection) {
      this.connection = new Redis(this.getRedisUrl(), {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
    }

    if (!this.queue) {
      this.queue = new Queue(CONTENT_PROCESS_QUEUE_NAME, {
        connection: this.connection,
      });
    }

    return this.queue;
  }

  private getAttempts(): number {
    const raw = Number(process.env.CONTENT_JOB_ATTEMPTS ?? 3);
    if (Number.isFinite(raw) && raw >= 1) {
      return Math.floor(raw);
    }

    return 3;
  }

  private isEnabled(): boolean {
    return (process.env.CONTENT_PIPELINE_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  }

  private getRedisUrl(): string {
    return process.env.REDIS_URL ?? 'redis://redis:6379';
  }
}
