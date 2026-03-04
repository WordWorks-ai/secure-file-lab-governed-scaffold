import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma.module.js';
import { SearchController } from './search.controller.js';
import { SearchQueueService } from './search-queue.service.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SearchController],
  providers: [SearchService, SearchQueueService],
  exports: [SearchService, SearchQueueService],
})
export class SearchModule {}
