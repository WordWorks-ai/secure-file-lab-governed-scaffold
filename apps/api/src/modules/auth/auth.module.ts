import { Module, forwardRef } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../persistence/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtTokenService } from './jwt-token.service.js';
import { KeycloakSsoService } from './keycloak-sso.service.js';
import { MfaService } from './mfa.service.js';
import { ActiveUserGuard } from './guards/active-user.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

@Module({
  imports: [PrismaModule, forwardRef(() => AuditModule)],
  controllers: [AuthController],
  providers: [AuthService, JwtTokenService, KeycloakSsoService, MfaService, JwtAuthGuard, ActiveUserGuard, RolesGuard],
  exports: [AuthService, JwtTokenService, KeycloakSsoService, MfaService, JwtAuthGuard, ActiveUserGuard, RolesGuard],
})
export class AuthModule {}
