import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import { Redis } from 'ioredis';

import {
  SEARCH_INDEX_JOB_NAME,
  SEARCH_INDEX_QUEUE_NAME,
  SearchIndexAction,
  SearchIndexJobPayload,
} from './contracts/search-index-queue.contract.js';

@Injectable()
export class SearchQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(SearchQueueService.name);
  private connection: Redis | null = null;
  private queue: Queue<SearchIndexJobPayload> | null = null;

  async enqueue(action: SearchIndexAction, fileId: string): Promise<void> {
    if (!this.isSearchEnabled()) {
      return;
    }

    const queue = this.getQueue();
    const options: JobsOptions = {
      jobId: `${action}:${fileId}`,
      attempts: this.getAttempts(),
      backoff: {
        type: 'exponential',
        delay: 2_000,
      },
      removeOnComplete: 1_000,
      removeOnFail: 4_000,
    };

    await queue.add(SEARCH_INDEX_JOB_NAME, { action, fileId }, options);
    this.logger.debug(`enqueued search index job action=${action} fileId=${fileId}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    this.connection?.disconnect();
  }

  private getQueue(): Queue<SearchIndexJobPayload> {
    if (!this.connection) {
      this.connection = new Redis(this.getRedisUrl(), {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
    }

    if (!this.queue) {
      this.queue = new Queue(SEARCH_INDEX_QUEUE_NAME, {
        connection: this.connection,
      });
    }

    return this.queue;
  }

  private isSearchEnabled(): boolean {
    return (process.env.OPENSEARCH_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  }

  private getAttempts(): number {
    const raw = Number(process.env.SEARCH_INDEX_JOB_ATTEMPTS ?? 3);
    if (Number.isFinite(raw) && raw >= 1) {
      return Math.floor(raw);
    }

    return 3;
  }

  private getRedisUrl(): string {
    return process.env.REDIS_URL ?? 'redis://redis:6379';
  }
}
