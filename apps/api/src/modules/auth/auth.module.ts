import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { PrismaModule } from '../persistence/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtTokenService } from './jwt-token.service.js';
import { KeycloakSsoService } from './keycloak-sso.service.js';
import { MfaService } from './mfa.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AuthController],
  providers: [AuthService, JwtTokenService, KeycloakSsoService, MfaService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtTokenService, KeycloakSsoService, MfaService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
