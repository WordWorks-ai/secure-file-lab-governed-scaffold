import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  onModuleInit(): void {
    this.logger.log('Auth domain module scaffold initialized (runtime flows start in Phase 3).');
  }
}
