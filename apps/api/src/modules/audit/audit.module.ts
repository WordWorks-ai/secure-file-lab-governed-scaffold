import { Module } from '@nestjs/common';

import { JwtTokenService } from '../auth/jwt-token.service.js';
import { PrismaModule } from '../persistence/prisma.module.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [AuditService, JwtTokenService],
  exports: [AuditService],
})
export class AuditModule {}
