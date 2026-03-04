import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { FileCryptoService } from '../files/file-crypto.service.js';
import { MinioObjectStorageService } from '../files/minio-object-storage.service.js';
import { VaultTransitService } from '../files/vault-transit.service.js';
import { PrismaModule } from '../persistence/prisma.module.js';
import { SharesController } from './shares.controller.js';
import { SharesService } from './shares.service.js';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule],
  controllers: [SharesController],
  providers: [
    SharesService,
    FileCryptoService,
    MinioObjectStorageService,
    VaultTransitService,
  ],
  exports: [SharesService],
})
export class SharesModule {}
