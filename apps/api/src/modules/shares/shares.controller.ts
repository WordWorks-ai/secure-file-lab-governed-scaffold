import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { createValidationException } from '../../common/validation/validation-exception.factory.js';
import { AuthenticatedRequest, AuthenticatedUser } from '../auth/types/authenticated-request.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AccessShareDto } from './dto/access-share.dto.js';
import { CreateShareDto } from './dto/create-share.dto.js';
import { SharesService } from './shares.service.js';

@Controller('shares')
export class SharesController {
  constructor(@Inject(SharesService) private readonly sharesService: SharesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
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
    return this.sharesService.createShare(payload, this.requireUser(request), this.getRequestContext(request));
  }

  @Post(':shareId/revoke')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async revoke(
    @Param('shareId', new ParseUUIDPipe({ version: '4' })) shareId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ shareId: string; revokedAt: string }> {
    return this.sharesService.revokeShare(shareId, this.requireUser(request), this.getRequestContext(request));
  }

  @Post('access')
  @HttpCode(200)
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
    return this.sharesService.accessShare(payload, this.getRequestContext(request));
  }

  private requireUser(request: AuthenticatedRequest): AuthenticatedUser {
    if (!request.user) {
      throw new UnauthorizedException('Invalid access token');
    }

    return request.user;
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
