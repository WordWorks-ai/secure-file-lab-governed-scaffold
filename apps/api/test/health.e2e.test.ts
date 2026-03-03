import 'reflect-metadata';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

describe('health endpoints', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('v1');
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
    const payload = response.statusCode === 200 ? response.body : response.body.message;

    expect(['ready', 'not_ready']).toContain(payload.status);
    expect(Array.isArray(payload.dependencies)).toBe(true);
  });
});
