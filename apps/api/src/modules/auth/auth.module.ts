import { Module } from '@nestjs/common';

import { PrismaModule } from '../persistence/prisma.module.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [PrismaModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
