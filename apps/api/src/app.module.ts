import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { SharesModule } from './modules/shares/shares.module.js';
import { SystemModule } from './modules/system/system.module.js';
import { UsersOrgsModule } from './modules/users-orgs/users-orgs.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: false,
    }),
    HealthModule,
    SystemModule,
    AuthModule,
    UsersOrgsModule,
    FilesModule,
    SharesModule,
    SearchModule,
    AuditModule,
  ],
})
export class AppModule {}
