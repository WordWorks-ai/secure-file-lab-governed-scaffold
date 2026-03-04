import { Module } from '@nestjs/common';

import { PrismaModule } from '../persistence/prisma.module.js';
import { DependencyHealthService } from './dependency-health.service.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [DependencyHealthService],
})
export class HealthModule {}
