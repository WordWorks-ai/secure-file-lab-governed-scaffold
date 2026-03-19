import { UserRole } from '@prisma/client';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';

import { getRequestContext, requireAuthenticatedUser } from '../../common/request-context.js';
import { createValidationException } from '../../common/validation/validation-exception.factory.js';
import { Roles } from './decorators/roles.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { SsoExchangeDto } from './dto/sso-exchange.dto.js';
import { VerifyTotpDto } from './dto/verify-totp.dto.js';
import { WebauthnRegisterVerifyDto } from './dto/webauthn-register-verify.dto.js';
import { ActiveUserGuard } from './guards/active-user.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { AuthService, AuthTokenResponse } from './auth.service.js';
import { AuthenticatedRequest, AuthenticatedUser } from './types/authenticated-request.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: LoginDto,
      exceptionFactory: createValidationException,
    }),
  )
  async login(
    @Body() payload: LoginDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AuthTokenResponse> {
    return this.authService.login(
      payload.email,
      payload.password,
      {
        totpCode: payload.totpCode,
        webauthnChallengeToken: payload.webauthnChallengeToken,
        webauthnCredentialId: payload.webauthnCredentialId,
        webauthnClientDataJson: payload.webauthnClientDataJson,
      },
      getRequestContext(request),
    );
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: RefreshDto,
      exceptionFactory: createValidationException,
    }),
  )
  async refresh(
    @Body() payload: RefreshDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AuthTokenResponse> {
    return this.authService.refresh(payload.refreshToken, getRequestContext(request));
  }

  @Post('sso/exchange')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: SsoExchangeDto,
      exceptionFactory: createValidationException,
    }),
  )
  async exchangeSsoAccessToken(
    @Body() payload: SsoExchangeDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AuthTokenResponse> {
    return this.authService.exchangeSsoAccessToken(payload.accessToken, getRequestContext(request));
  }

  @Post('logout')
  @HttpCode(200)
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: LogoutDto,
      exceptionFactory: createValidationException,
    }),
  )
  async logout(
    @Body() payload: LogoutDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ success: true }> {
    return this.authService.logout(payload.refreshToken, getRequestContext(request));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  me(@Req() request: AuthenticatedRequest): { user: AuthenticatedUser } {
    if (!request.user) {
      throw new UnauthorizedException('Invalid access token');
    }

    return { user: request.user };
  }

  @Get('admin-check')
  @UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
  @Roles(UserRole.admin)
  adminCheck(): { allowed: true } {
    return { allowed: true };
  }

  @Get('mfa/status')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  async getMfaStatus(@Req() request: AuthenticatedRequest): Promise<{
    totp: {
      enrolled: boolean;
      enabled: boolean;
    };
    webauthn: {
      credentialCount: number;
    };
  }> {
    const user = requireAuthenticatedUser(request);
    return this.authService.getMfaStatus(user.sub);
  }

  @Post('mfa/totp/enroll')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  async beginTotpEnrollment(
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    issuer: string;
    accountName: string;
    secret: string;
    otpauthUri: string;
  }> {
    const user = requireAuthenticatedUser(request);
    return this.authService.beginTotpEnrollment(
      {
        id: user.sub,
        email: user.email,
      },
      getRequestContext(request),
    );
  }

  @Post('mfa/totp/verify')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: VerifyTotpDto,
      exceptionFactory: createValidationException,
    }),
  )
  async verifyTotpEnrollment(
    @Req() request: AuthenticatedRequest,
    @Body() payload: VerifyTotpDto,
  ): Promise<{ enabled: true }> {
    const user = requireAuthenticatedUser(request);
    return this.authService.verifyTotpEnrollment(
      {
        id: user.sub,
      },
      payload.code,
      getRequestContext(request),
    );
  }

  @Delete('mfa/totp')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  async disableTotp(@Req() request: AuthenticatedRequest): Promise<{ disabled: true }> {
    const user = requireAuthenticatedUser(request);
    return this.authService.disableTotp(
      {
        id: user.sub,
      },
      getRequestContext(request),
    );
  }

  @Post('mfa/webauthn/register/options')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  async beginWebauthnRegistration(
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    challengeToken: string;
    options: {
      challenge: string;
      rp: {
        name: string;
        id: string;
      };
      user: {
        id: string;
        name: string;
        displayName: string;
      };
      timeout: number;
      pubKeyCredParams: Array<{
        type: 'public-key';
        alg: number;
      }>;
    };
  }> {
    const user = requireAuthenticatedUser(request);
    return this.authService.beginWebauthnRegistration(
      {
        id: user.sub,
        email: user.email,
      },
      getRequestContext(request),
    );
  }

  @Post('mfa/webauthn/register/verify')
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: WebauthnRegisterVerifyDto,
      exceptionFactory: createValidationException,
    }),
  )
  async finishWebauthnRegistration(
    @Req() request: AuthenticatedRequest,
    @Body() payload: WebauthnRegisterVerifyDto,
  ): Promise<{ registered: true }> {
    const user = requireAuthenticatedUser(request);
    return this.authService.finishWebauthnRegistration(
      {
        id: user.sub,
      },
      payload,
      getRequestContext(request),
    );
  }

}
