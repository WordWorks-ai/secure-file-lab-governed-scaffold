import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class SharesService implements OnModuleInit {
  private readonly logger = new Logger(SharesService.name);

  onModuleInit(): void {
    this.logger.log('Shares domain module scaffold initialized (share runtime starts in Phase 6).');
  }
}
