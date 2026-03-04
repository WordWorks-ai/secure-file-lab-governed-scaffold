import 'reflect-metadata';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureApiApplication } from '../src/bootstrap/configure-api-application.js';
import { AppModule } from '../src/app.module.js';

type ReadinessPayload = {
  status: 'ready' | 'not_ready';
  dependencies: Array<{ name: string; ok: boolean }>;
};

function asReadinessPayload(value: unknown): ReadinessPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    status?: unknown;
    dependencies?: unknown;
  };

  if (
    (candidate.status === 'ready' || candidate.status === 'not_ready') &&
    Array.isArray(candidate.dependencies)
  ) {
    return candidate as ReadinessPayload;
  }

  return null;
}

describe('health endpoints', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApiApplication(app);
    await app.init();
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns liveness payload', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health/live');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'api' });
  });

  it('returns structured readiness payload', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health/ready');

    expect([200, 503]).toContain(response.statusCode);
    const payload = asReadinessPayload(response.body) ?? asReadinessPayload(response.body?.message);

    if (response.statusCode === 200) {
      expect(payload).not.toBeNull();
      expect(payload?.status).toBe('ready');
      expect(Array.isArray(payload?.dependencies)).toBe(true);
      return;
    }

    expect(response.statusCode).toBe(503);
    if (payload) {
      expect(payload.status).toBe('not_ready');
      expect(Array.isArray(payload.dependencies)).toBe(true);
      return;
    }

    const fallback = response.body?.message ?? response.body?.error;
    expect(
      typeof fallback === 'string' || (Array.isArray(fallback) && fallback.every((x) => typeof x === 'string')),
    ).toBe(true);
  });
});
