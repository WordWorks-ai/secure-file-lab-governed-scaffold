import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../persistence/prisma.module.js';
import { PolicyModule } from '../policy/policy.module.js';
import { SearchModule } from '../search/search.module.js';
import { ContentQueueService } from './content-queue.service.js';
import { FilesController } from './files.controller.js';
import { FileCryptoService } from './file-crypto.service.js';
import { FileQueueService } from './file-queue.service.js';
import { FilesService } from './files.service.js';
import { MinioObjectStorageService } from './minio-object-storage.service.js';
import { VaultTransitService } from './vault-transit.service.js';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule, PolicyModule, SearchModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    FileCryptoService,
    FileQueueService,
    ContentQueueService,
    MinioObjectStorageService,
    VaultTransitService,
  ],
  exports: [FilesService],
})
export class FilesModule {}
