import 'reflect-metadata';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WorkerModule } from '../src/worker.module.js';

describe('worker health endpoints', () => {
  let app: INestApplication;
  const originalQueueBootFlag = process.env.WORKER_QUEUE_BOOT_DISABLED;

  beforeAll(async () => {
    process.env.WORKER_QUEUE_BOOT_DISABLED = 'true';

    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('v1');
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();

    if (originalQueueBootFlag === undefined) {
      delete process.env.WORKER_QUEUE_BOOT_DISABLED;
    } else {
      process.env.WORKER_QUEUE_BOOT_DISABLED = originalQueueBootFlag;
    }
  });

  it('returns liveness payload', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health/live');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'worker' });
  });

  it('returns prometheus metrics payload', async () => {
    const response = await request(app.getHttpServer()).get('/v1/metrics');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('sfl_worker_info');
    expect(response.text).toContain('sfl_worker_uptime_seconds');
  });
});
