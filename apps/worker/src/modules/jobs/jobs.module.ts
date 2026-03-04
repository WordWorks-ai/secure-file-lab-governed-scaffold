import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../persistence/prisma.module.js';
import { JobsService } from './jobs.service.js';
import { ClamavScannerService } from './services/clamav-scanner.service.js';
import { WorkerContentDerivativesService } from './services/worker-content-derivatives.service.js';
import { WorkerFileCryptoService } from './services/worker-file-crypto.service.js';
import { WorkerMinioObjectStorageService } from './services/worker-minio-object-storage.service.js';
import { WorkerOpenSearchIndexService } from './services/worker-opensearch-index.service.js';
import { WorkerVaultTransitService } from './services/worker-vault-transit.service.js';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [
    JobsService,
    ClamavScannerService,
    WorkerContentDerivativesService,
    WorkerFileCryptoService,
    WorkerMinioObjectStorageService,
    WorkerOpenSearchIndexService,
    WorkerVaultTransitService,
  ],
})
export class JobsModule {}
