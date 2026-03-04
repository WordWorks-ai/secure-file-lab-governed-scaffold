import { Module } from '@nestjs/common';

import { PrismaModule } from '../persistence/prisma.module.js';
import { SharesService } from './shares.service.js';

@Module({
  imports: [PrismaModule],
  providers: [SharesService],
  exports: [SharesService],
})
export class SharesModule {}
