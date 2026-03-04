import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly logger = new Logger(FilesService.name);

  onModuleInit(): void {
    this.logger.log('Files domain module scaffold initialized (ingest/encryption starts in Phase 4).');
  }
}
