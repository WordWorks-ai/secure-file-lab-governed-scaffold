import 'reflect-metadata';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApiApplication } from '../src/bootstrap/configure-api-application.js';

describe('system endpoints', () => {
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

  it('returns phase-aware system info', async () => {
    const response = await request(app.getHttpServer()).get('/v1/system/info');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      service: 'api',
      phase: 'phase-8-ci-quality-gates-and-handoff-polish',
    });
  });

  it('echoes validated payloads', async () => {
    const response = await request(app.getHttpServer()).post('/v1/system/echo').send({
      message: 'validation smoke test',
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).toEqual({ message: 'validation smoke test' });
  });

  it('rejects non-whitelisted fields', async () => {
    const response = await request(app.getHttpServer()).post('/v1/system/echo').send({
      message: 'ok',
      ignoredField: 'not allowed',
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid payload shapes', async () => {
    const response = await request(app.getHttpServer()).post('/v1/system/echo').send({
      message: '',
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(response.body.errors)).toBe(true);
  });
});
