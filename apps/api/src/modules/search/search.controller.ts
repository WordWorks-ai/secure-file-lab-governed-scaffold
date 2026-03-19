import {
  Controller,
  Get,
  Inject,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { createValidationException } from '../../common/validation/validation-exception.factory.js';
import { ActiveUserGuard } from '../auth/guards/active-user.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AuthenticatedRequest, AuthenticatedUser } from '../auth/types/authenticated-request.js';
import { QuerySearchFilesDto } from './dto/query-search-files.dto.js';
import { SearchService } from './search.service.js';

@Controller('search')
@UseGuards(JwtAuthGuard, ActiveUserGuard)
export class SearchController {
  constructor(@Inject(SearchService) private readonly searchService: SearchService) {}

  @Get('files')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: QuerySearchFilesDto,
      exceptionFactory: createValidationException,
    }),
  )
  async searchFiles(
    @Query() query: QuerySearchFilesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    source: string;
    count: number;
    items: Array<{
      id: string;
      filename: string;
      contentType: string;
      status: string;
      orgId: string;
      ownerUserId: string;
      createdAt: string;
      updatedAt: string;
      score: number | null;
    }>;
  }> {
    return this.searchService.searchFiles(query.q, this.requireUser(request), query.limit);
  }

  private requireUser(request: AuthenticatedRequest): AuthenticatedUser {
    if (!request.user) {
      throw new UnauthorizedException('Invalid access token');
    }

    return request.user;
  }
}
