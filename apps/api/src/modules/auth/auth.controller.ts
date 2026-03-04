import { UserRole } from '@prisma/client';
import {
  Body,
  Controller,
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

import { createValidationException } from '../../common/validation/validation-exception.factory.js';
import { Roles } from './decorators/roles.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { AuthService, AuthTokenResponse } from './auth.service.js';
import { AuthenticatedRequest, AuthenticatedUser } from './types/authenticated-request.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
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
    return this.authService.login(payload.email, payload.password, this.getRequestContext(request));
  }

  @Post('refresh')
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
    return this.authService.refresh(payload.refreshToken, this.getRequestContext(request));
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
    return this.authService.logout(payload.refreshToken, this.getRequestContext(request));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: AuthenticatedRequest): { user: AuthenticatedUser } {
    if (!request.user) {
      throw new UnauthorizedException('Invalid access token');
    }

    return { user: request.user };
  }

  @Get('admin-check')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  adminCheck(): { allowed: true } {
    return { allowed: true };
  }

  private getRequestContext(request: AuthenticatedRequest): {
    ipAddress: string | null;
    userAgent: string | null;
  } {
    const header = request.headers?.['user-agent'];
    const userAgent = Array.isArray(header) ? header[0] : header;
    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
      userAgent: userAgent ?? null,
    };
  }
}
