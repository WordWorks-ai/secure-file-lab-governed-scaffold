import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HealthModule } from './modules/health/health.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { MetricsModule } from './modules/metrics/metrics.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    HealthModule,
    MetricsModule,
    JobsModule,
  ],
})
export class WorkerModule {}
