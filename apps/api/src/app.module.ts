import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HealthModule } from './modules/health/health.module.js';
import { SystemModule } from './modules/system/system.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: false,
    }),
    HealthModule,
    SystemModule,
  ],
})
export class AppModule {}
