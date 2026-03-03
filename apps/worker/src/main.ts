import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { WorkerModule } from './worker.module.js';

async function bootstrap(): Promise<void> {
  const port = Number(process.env.WORKER_HEALTH_PORT ?? 3001);
  const app = await NestFactory.create<NestFastifyApplication>(
    WorkerModule,
    new FastifyAdapter({ logger: true }),
  );

  app.setGlobalPrefix('v1');
  await app.listen(port, '0.0.0.0');

  Logger.log(`Worker health endpoint listening on port ${port}`, 'WorkerBootstrap');
}

void bootstrap();
