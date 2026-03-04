import { Module } from '@nestjs/common';

import { PrismaModule } from '../persistence/prisma.module.js';
import { FilesService } from './files.service.js';

@Module({
  imports: [PrismaModule],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
