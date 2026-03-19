import {
  Body,
  Controller,
  Get,
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
import { UserRole } from '@prisma/client';

import { createValidationException } from '../../common/validation/validation-exception.factory.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ActiveUserGuard } from '../auth/guards/active-user.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AuthenticatedRequest, AuthenticatedUser } from '../auth/types/authenticated-request.js';
import { UploadFileDto } from './dto/upload-file.dto.js';
import { FilesService } from './files.service.js';

@Controller('files')
@UseGuards(JwtAuthGuard, ActiveUserGuard)
export class FilesController {
  constructor(@Inject(FilesService) private readonly filesService: FilesService) {}

  @Post('upload')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: UploadFileDto,
      exceptionFactory: createValidationException,
    }),
  )
  async upload(
    @Body() payload: UploadFileDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    fileId: string;
    status: string;
    storageKey: string;
  }> {
    return this.filesService.uploadFile(payload, this.requireUser(request), this.getRequestContext(request));
  }

  @Post(':fileId/activate')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  async activate(
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ fileId: string; status: string }> {
    return this.filesService.activateFile(fileId, this.requireUser(request), this.getRequestContext(request));
  }

  @Get(':fileId')
  async getMetadata(
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    id: string;
    filename: string;
    contentType: string;
    sizeBytes: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }> {
    return this.filesService.getFileMetadata(fileId, this.requireUser(request));
  }

  @Get(':fileId/artifacts')
  async getArtifacts(
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    fileId: string;
    preview: {
      available: boolean;
      text: string | null;
      generatedAt: string | null;
    };
    ocr: {
      available: boolean;
      text: string | null;
      generatedAt: string | null;
    };
  }> {
    return this.filesService.getFileArtifacts(fileId, this.requireUser(request));
  }

  @Get(':fileId/download')
  async download(
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    fileId: string;
    filename: string;
    contentType: string;
    contentBase64: string;
  }> {
    return this.filesService.downloadFile(
      fileId,
      this.requireUser(request),
      this.getRequestContext(request),
    );
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
