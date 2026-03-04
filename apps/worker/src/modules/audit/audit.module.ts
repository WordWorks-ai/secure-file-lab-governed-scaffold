import { Module } from '@nestjs/common';

import { PrismaModule } from '../persistence/prisma.module.js';
import { AuditService } from './audit.service.js';

@Module({
  imports: [PrismaModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
