import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';

import { getRequestContext, requireAuthenticatedUser } from '../../common/request-context.js';
import { createValidationException } from '../../common/validation/validation-exception.factory.js';
import { AuthenticatedRequest, AuthenticatedUser } from '../auth/types/authenticated-request.js';
import { ActiveUserGuard } from '../auth/guards/active-user.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AccessShareDto } from './dto/access-share.dto.js';
import { CreateShareDto } from './dto/create-share.dto.js';
import { SharesService } from './shares.service.js';

@Controller('shares')
export class SharesController {
  constructor(@Inject(SharesService) private readonly sharesService: SharesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: CreateShareDto,
      exceptionFactory: createValidationException,
    }),
  )
  async create(
    @Body() payload: CreateShareDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    shareId: string;
    fileId: string;
    shareToken: string;
    expiresAt: string;
    maxDownloads: number | null;
    requiresPassword: boolean;
  }> {
    return this.sharesService.createShare(payload, requireAuthenticatedUser(request), getRequestContext(request));
  }

  @Post(':shareId/revoke')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ActiveUserGuard)
  async revoke(
    @Param('shareId', new ParseUUIDPipe({ version: '4' })) shareId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ shareId: string; revokedAt: string }> {
    return this.sharesService.revokeShare(shareId, requireAuthenticatedUser(request), getRequestContext(request));
  }

  @Post('access')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: AccessShareDto,
      exceptionFactory: createValidationException,
    }),
  )
  async access(
    @Body() payload: AccessShareDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    shareId: string;
    fileId: string;
    filename: string;
    contentType: string;
    contentBase64: string;
  }> {
    return this.sharesService.accessShare(payload, getRequestContext(request));
  }

}
