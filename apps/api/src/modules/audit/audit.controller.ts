import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Query,
  Req,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuditResult, UserRole } from '@prisma/client';

import { createValidationException } from '../../common/validation/validation-exception.factory.js';
import { JwtTokenService } from '../auth/jwt-token.service.js';
import { AuthenticatedRequest, AuthenticatedUser } from '../auth/types/authenticated-request.js';
import { QueryAuditEventsDto } from './dto/query-audit-events.dto.js';
import { QueryAuditKpisDto } from './dto/query-audit-kpis.dto.js';
import { QueryAuditSummaryDto } from './dto/query-audit-summary.dto.js';
import { QueryAuditTimeseriesDto } from './dto/query-audit-timeseries.dto.js';
import { AuditService } from './audit.service.js';

@Controller('audit')
export class AuditController {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(JwtTokenService) private readonly jwtTokenService: JwtTokenService,
  ) {}

  @Get('events')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: QueryAuditEventsDto,
      exceptionFactory: createValidationException,
    }),
  )
  async listEvents(
    @Query() query: QueryAuditEventsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    count: number;
    events: Array<{
      id: string;
      orgId: string | null;
      actorUserId: string | null;
      actorType: string;
      action: string;
      resourceType: string;
      resourceId: string | null;
      result: AuditResult;
      ipAddress: string | null;
      userAgent: string | null;
      metadata: unknown;
      prevEventHash: string | null;
      eventHash: string | null;
      chainVersion: string;
      createdAt: string;
    }>;
  }> {
    this.requireAdminUser(request);
    const events = await this.auditService.queryEvents({
      orgId: query.orgId,
      actorType: query.actorType,
      action: query.action,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      result: query.result,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
    });

    return {
      count: events.length,
      events: events.map((event) => ({
        id: event.id,
        orgId: event.orgId,
        actorUserId: event.actorUserId,
        actorType: event.actorType,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        result: event.result,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        metadata: event.metadataJson,
        prevEventHash: event.prevEventHash,
        eventHash: event.eventHash,
        chainVersion: event.chainVersion,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  @Get('events/export')
  @Header('content-type', 'application/x-ndjson; charset=utf-8')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: QueryAuditEventsDto,
      exceptionFactory: createValidationException,
    }),
  )
  async exportEvents(
    @Query() query: QueryAuditEventsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<string> {
    this.requireAdminUser(request);
    const events = await this.auditService.queryEvents({
      orgId: query.orgId,
      actorType: query.actorType,
      action: query.action,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      result: query.result,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
    });

    return events
      .map((event) =>
        JSON.stringify({
          id: event.id,
          orgId: event.orgId,
          actorUserId: event.actorUserId,
          actorType: event.actorType,
          action: event.action,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          result: event.result,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          metadata: event.metadataJson,
          prevEventHash: event.prevEventHash,
          eventHash: event.eventHash,
          chainVersion: event.chainVersion,
          createdAt: event.createdAt.toISOString(),
        }),
      )
      .join('\n');
  }

  @Get('events/summary')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: QueryAuditSummaryDto,
      exceptionFactory: createValidationException,
    }),
  )
  async summarizeEvents(
    @Query() query: QueryAuditSummaryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    sampledCount: number;
    sampleLimit: number;
    topCount: number;
    byAction: Array<{ action: string; count: number }>;
    byResult: Array<{ result: AuditResult; count: number }>;
    byResourceType: Array<{ resourceType: string; count: number }>;
    byActorType: Array<{ actorType: string; count: number }>;
  }> {
    this.requireAdminUser(request);
    const summary = await this.auditService.querySummary({
      orgId: query.orgId,
      actorType: query.actorType,
      action: query.action,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      result: query.result,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      top: query.top,
    });

    return {
      sampledCount: summary.sampledCount,
      sampleLimit: summary.sampleLimit,
      topCount: summary.topCount,
      byAction: summary.byAction,
      byResult: summary.byResult,
      byResourceType: summary.byResourceType,
      byActorType: summary.byActorType.map((bucket) => ({
        actorType: bucket.actorType,
        count: bucket.count,
      })),
    };
  }

  @Get('events/timeseries')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: QueryAuditTimeseriesDto,
      exceptionFactory: createValidationException,
    }),
  )
  async timeseriesEvents(
    @Query() query: QueryAuditTimeseriesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    sampledCount: number;
    sampleLimit: number;
    bucket: 'hour' | 'day';
    points: Array<{
      bucketStart: string;
      count: number;
      successCount: number;
      failureCount: number;
      deniedCount: number;
    }>;
  }> {
    this.requireAdminUser(request);
    return this.auditService.queryTimeseries({
      orgId: query.orgId,
      actorType: query.actorType,
      action: query.action,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      result: query.result,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      bucket: query.bucket,
    });
  }

  @Get('events/kpis')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: QueryAuditKpisDto,
      exceptionFactory: createValidationException,
    }),
  )
  async kpisEvents(
    @Query() query: QueryAuditKpisDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    sampleLimit: number;
    windowHours: number;
    currentWindow: { from: string; to: string };
    previousWindow: { from: string; to: string };
    current: {
      sampledCount: number;
      successCount: number;
      failureCount: number;
      deniedCount: number;
      successRate: number;
      failureRate: number;
      deniedRate: number;
    };
    previous: {
      sampledCount: number;
      successCount: number;
      failureCount: number;
      deniedCount: number;
      successRate: number;
      failureRate: number;
      deniedRate: number;
    };
    deltas: {
      sampledCount: number;
      successRate: number;
      failureRate: number;
      deniedRate: number;
    };
  }> {
    this.requireAdminUser(request);
    return this.auditService.queryKpis({
      orgId: query.orgId,
      actorType: query.actorType,
      action: query.action,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      result: query.result,
      limit: query.limit,
      windowHours: query.windowHours,
    });
  }

  private requireAdminUser(request: AuthenticatedRequest): AuthenticatedUser {
    const authorization = request.headers?.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    if (!value) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const [scheme, token] = value.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    let user: AuthenticatedUser;
    try {
      user = this.jwtTokenService.verifyAccessToken(token.trim());
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    if (user.role !== UserRole.admin) {
      throw new ForbiddenException('Admin role required');
    }

    return user;
  }
}
