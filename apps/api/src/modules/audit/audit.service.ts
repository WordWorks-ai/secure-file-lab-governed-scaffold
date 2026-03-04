import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class AuditService implements OnModuleInit {
  private readonly logger = new Logger(AuditService.name);

  onModuleInit(): void {
    this.logger.log('Audit domain module scaffold initialized (full event emission starts in later phases).');
  }
}
