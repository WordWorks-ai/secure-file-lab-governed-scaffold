import { Module } from '@nestjs/common';

import { PrismaModule } from '../persistence/prisma.module.js';
import { UsersOrgsService } from './users-orgs.service.js';

@Module({
  imports: [PrismaModule],
  providers: [UsersOrgsService],
  exports: [UsersOrgsService],
})
export class UsersOrgsModule {}
