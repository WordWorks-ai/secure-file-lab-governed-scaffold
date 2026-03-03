import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);

  onModuleInit(): void {
    this.logger.log('Worker job module initialized (queue processors will be implemented in Phase 5).');
  }
}
