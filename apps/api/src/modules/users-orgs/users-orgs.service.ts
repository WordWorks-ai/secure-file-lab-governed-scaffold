import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class UsersOrgsService implements OnModuleInit {
  private readonly logger = new Logger(UsersOrgsService.name);

  onModuleInit(): void {
    this.logger.log('Users/Orgs domain module scaffold initialized.');
  }
}
