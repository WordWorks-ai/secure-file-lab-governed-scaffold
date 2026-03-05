import { AuditActorType, AuditResult, Prisma } from '@prisma/client';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { PrismaService } from '../persistence/prisma.service.js';

export type AuditEventInput = {
  action: string;
  resourceType: string;
  result: AuditResult;
  actorType: AuditActorType;
  actorUserId?: string | null;
  orgId?: string | null;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type QueryAuditEventsInput = {
  orgId?: string;
  actorType?: AuditActorType;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  result?: AuditResult;
  from?: Date;
  to?: Date;
  limit?: number;
};

export type QueryAuditSummaryInput = {
  orgId?: string;
  actorType?: AuditActorType;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  result?: AuditResult;
  from?: Date;
  to?: Date;
  limit?: number;
  top?: number;
};

export type QueryAuditTimeseriesInput = {
  orgId?: string;
  actorType?: AuditActorType;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  result?: AuditResult;
  from?: Date;
  to?: Date;
  limit?: number;
  bucket?: 'hour' | 'day';
};

export type QueryAuditKpisInput = {
  orgId?: string;
  actorType?: AuditActorType;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  result?: AuditResult;
  limit?: number;
  windowHours?: number;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly chainVersion = 'sha256-v1';
  private readonly chainWriteLockKey = 827_115_409;

  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  async recordEvent(input: AuditEventInput): Promise<void> {
    try {
      await this.prismaService.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${this.chainWriteLockKey})`;

        const previousEvent = await tx.auditEvent.findFirst({
          where: { eventHash: { not: null } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { eventHash: true },
        });

        const createdAt = new Date();
        const metadataJson = this.normalizeJsonValue(input.metadata ?? {}) as Prisma.InputJsonValue;
        const id = randomUUID();
        const prevEventHash = previousEvent?.eventHash ?? null;
        const eventHash = this.computeEventHash({
          id,
          chainVersion: this.chainVersion,
          prevEventHash,
          createdAt,
          action: input.action,
          resourceType: input.resourceType,
          result: input.result,
          actorType: input.actorType,
          actorUserId: input.actorUserId ?? null,
          orgId: input.orgId ?? null,
          resourceId: input.resourceId ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          metadataJson,
        });

        await tx.auditEvent.create({
          data: {
            id,
            action: input.action,
            resourceType: input.resourceType,
            result: input.result,
            actorType: input.actorType,
            actorUserId: input.actorUserId ?? null,
            orgId: input.orgId ?? null,
            resourceId: input.resourceId ?? null,
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
            metadataJson,
            prevEventHash,
            eventHash,
            chainVersion: this.chainVersion,
            createdAt,
          },
        });
      });
    } catch (error: unknown) {
      this.logger.error(
        `audit event write failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  async queryEvents(input: QueryAuditEventsInput): Promise<
    Array<{
      id: string;
      orgId: string | null;
      actorUserId: string | null;
      actorType: AuditActorType;
      action: string;
      resourceType: string;
      resourceId: string | null;
      result: AuditResult;
      ipAddress: string | null;
      userAgent: string | null;
      metadataJson: Prisma.JsonValue;
      prevEventHash: string | null;
      eventHash: string | null;
      chainVersion: string;
      createdAt: Date;
    }>
  > {
    const where = this.buildWhereInput(input);

    const take = this.normalizeLimit(input.limit);
    return this.prismaService.auditEvent.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take,
    });
  }

  async querySummary(input: QueryAuditSummaryInput): Promise<{
    sampledCount: number;
    sampleLimit: number;
    topCount: number;
    byAction: Array<{ action: string; count: number }>;
    byResult: Array<{ result: AuditResult; count: number }>;
    byResourceType: Array<{ resourceType: string; count: number }>;
    byActorType: Array<{ actorType: AuditActorType; count: number }>;
  }> {
    const where = this.buildWhereInput(input);
    const sampleLimit = this.normalizeSummaryLimit(input.limit);
    const topCount = this.normalizeTopCount(input.top);

    const events = await this.prismaService.auditEvent.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: sampleLimit,
    });

    return {
      sampledCount: events.length,
      sampleLimit,
      topCount,
      byAction: this.bucketize(events.map((event) => event.action), topCount).map((bucket) => ({
        action: bucket.value,
        count: bucket.count,
      })),
      byResult: this.bucketize(events.map((event) => event.result), topCount).map((bucket) => ({
        result: bucket.value,
        count: bucket.count,
      })),
      byResourceType: this.bucketize(events.map((event) => event.resourceType), topCount).map((bucket) => ({
        resourceType: bucket.value,
        count: bucket.count,
      })),
      byActorType: this.bucketize(events.map((event) => event.actorType), topCount).map((bucket) => ({
        actorType: bucket.value,
        count: bucket.count,
      })),
    };
  }

  async queryTimeseries(input: QueryAuditTimeseriesInput): Promise<{
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
    const where = this.buildWhereInput(input);
    const sampleLimit = this.normalizeSummaryLimit(input.limit);
    const bucket = this.normalizeBucket(input.bucket);

    const events = await this.prismaService.auditEvent.findMany({
      where,
      orderBy: {
        createdAt: 'asc',
      },
      take: sampleLimit,
    });

    const pointsByBucket = new Map<
      string,
      {
        bucketStart: string;
        count: number;
        successCount: number;
        failureCount: number;
        deniedCount: number;
      }
    >();

    for (const event of events) {
      const bucketStartDate = this.floorToBucket(event.createdAt, bucket);
      const bucketStart = bucketStartDate.toISOString();
      const existing = pointsByBucket.get(bucketStart) ?? {
        bucketStart,
        count: 0,
        successCount: 0,
        failureCount: 0,
        deniedCount: 0,
      };

      existing.count += 1;
      if (event.result === AuditResult.success) {
        existing.successCount += 1;
      } else if (event.result === AuditResult.failure) {
        existing.failureCount += 1;
      } else if (event.result === AuditResult.denied) {
        existing.deniedCount += 1;
      }

      pointsByBucket.set(bucketStart, existing);
    }

    return {
      sampledCount: events.length,
      sampleLimit,
      bucket,
      points: [...pointsByBucket.values()].sort((left, right) =>
        left.bucketStart.localeCompare(right.bucketStart),
      ),
    };
  }

  async queryKpis(input: QueryAuditKpisInput): Promise<{
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
    const sampleLimit = this.normalizeSummaryLimit(input.limit);
    const windowHours = this.normalizeWindowHours(input.windowHours);

    const now = new Date();
    const windowMs = windowHours * 60 * 60 * 1000;
    const currentFrom = new Date(now.getTime() - windowMs);
    const previousFrom = new Date(currentFrom.getTime() - windowMs);
    const previousTo = currentFrom;

    const currentWhere = this.buildWhereInput({
      orgId: input.orgId,
      actorType: input.actorType,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      result: input.result,
      from: currentFrom,
      to: now,
    });

    const previousWhere = this.buildWhereInput({
      orgId: input.orgId,
      actorType: input.actorType,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      result: input.result,
      from: previousFrom,
      to: previousTo,
    });

    const [currentEvents, previousEvents] = await Promise.all([
      this.prismaService.auditEvent.findMany({
        where: currentWhere,
        orderBy: { createdAt: 'desc' },
        take: sampleLimit,
      }),
      this.prismaService.auditEvent.findMany({
        where: previousWhere,
        orderBy: { createdAt: 'desc' },
        take: sampleLimit,
      }),
    ]);

    const current = this.computeResultMetrics(currentEvents.map((event) => event.result));
    const previous = this.computeResultMetrics(previousEvents.map((event) => event.result));

    return {
      sampleLimit,
      windowHours,
      currentWindow: {
        from: currentFrom.toISOString(),
        to: now.toISOString(),
      },
      previousWindow: {
        from: previousFrom.toISOString(),
        to: previousTo.toISOString(),
      },
      current,
      previous,
      deltas: {
        sampledCount: current.sampledCount - previous.sampledCount,
        successRate: current.successRate - previous.successRate,
        failureRate: current.failureRate - previous.failureRate,
        deniedRate: current.deniedRate - previous.deniedRate,
      },
    };
  }

  private normalizeLimit(rawLimit: number | undefined): number {
    if (rawLimit === undefined) {
      return 100;
    }

    if (Number.isFinite(rawLimit) && rawLimit >= 1) {
      return Math.min(Math.floor(rawLimit), 500);
    }

    return 100;
  }

  private normalizeSummaryLimit(rawLimit: number | undefined): number {
    if (rawLimit === undefined) {
      return 1000;
    }

    if (Number.isFinite(rawLimit) && rawLimit >= 1) {
      return Math.min(Math.floor(rawLimit), 5000);
    }

    return 1000;
  }

  private normalizeTopCount(rawTop: number | undefined): number {
    if (rawTop === undefined) {
      return 10;
    }

    if (Number.isFinite(rawTop) && rawTop >= 1) {
      return Math.min(Math.floor(rawTop), 50);
    }

    return 10;
  }

  private normalizeBucket(rawBucket: string | undefined): 'hour' | 'day' {
    if (rawBucket === 'day') {
      return 'day';
    }

    return 'hour';
  }

  private normalizeWindowHours(rawWindowHours: number | undefined): number {
    if (rawWindowHours === undefined) {
      return 24;
    }

    if (Number.isFinite(rawWindowHours) && rawWindowHours >= 1) {
      return Math.min(Math.floor(rawWindowHours), 720);
    }

    return 24;
  }

  private buildWhereInput(input: {
    orgId?: string;
    actorType?: AuditActorType;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    result?: AuditResult;
    from?: Date;
    to?: Date;
  }): Prisma.AuditEventWhereInput {
    const where: Prisma.AuditEventWhereInput = {};

    if (input.orgId) {
      where.orgId = input.orgId;
    }
    if (input.actorType) {
      where.actorType = input.actorType;
    }
    if (input.action) {
      where.action = input.action;
    }
    if (input.resourceType) {
      where.resourceType = input.resourceType;
    }
    if (input.resourceId) {
      where.resourceId = input.resourceId;
    }
    if (input.result) {
      where.result = input.result;
    }
    if (input.from || input.to) {
      where.createdAt = {
        gte: input.from,
        lte: input.to,
      };
    }

    return where;
  }

  private bucketize<T extends string>(values: T[], topCount: number): Array<{ value: T; count: number }> {
    const counts = new Map<T, number>();
    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((left, right) => {
        if (right[1] !== left[1]) {
          return right[1] - left[1];
        }
        return String(left[0]).localeCompare(String(right[0]));
      })
      .slice(0, topCount)
      .map(([value, count]) => ({ value, count }));
  }

  private floorToBucket(date: Date, bucket: 'hour' | 'day'): Date {
    const floored = new Date(date);
    floored.setUTCMinutes(0, 0, 0);
    if (bucket === 'day') {
      floored.setUTCHours(0, 0, 0, 0);
    }

    return floored;
  }

  private computeResultMetrics(results: AuditResult[]): {
    sampledCount: number;
    successCount: number;
    failureCount: number;
    deniedCount: number;
    successRate: number;
    failureRate: number;
    deniedRate: number;
  } {
    const sampledCount = results.length;
    let successCount = 0;
    let failureCount = 0;
    let deniedCount = 0;

    for (const result of results) {
      if (result === AuditResult.success) {
        successCount += 1;
      } else if (result === AuditResult.failure) {
        failureCount += 1;
      } else if (result === AuditResult.denied) {
        deniedCount += 1;
      }
    }

    if (sampledCount === 0) {
      return {
        sampledCount,
        successCount,
        failureCount,
        deniedCount,
        successRate: 0,
        failureRate: 0,
        deniedRate: 0,
      };
    }

    return {
      sampledCount,
      successCount,
      failureCount,
      deniedCount,
      successRate: successCount / sampledCount,
      failureRate: failureCount / sampledCount,
      deniedRate: deniedCount / sampledCount,
    };
  }

  private computeEventHash(input: {
    id: string;
    chainVersion: string;
    prevEventHash: string | null;
    createdAt: Date;
    action: string;
    resourceType: string;
    result: AuditResult;
    actorType: AuditActorType;
    actorUserId: string | null;
    orgId: string | null;
    resourceId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    metadataJson: Prisma.InputJsonValue;
  }): string {
    const payload = {
      id: input.id,
      chainVersion: input.chainVersion,
      prevEventHash: input.prevEventHash,
      createdAt: input.createdAt.toISOString(),
      action: input.action,
      resourceType: input.resourceType,
      result: input.result,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      orgId: input.orgId,
      resourceId: input.resourceId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadataJson: input.metadataJson,
    };

    return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
  }

  private normalizeJsonValue(value: unknown): unknown {
    if (value === null) {
      return null;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.normalizeJsonValue(entry));
    }
    if (value instanceof Date) {
      return value.toISOString();
    }

    const objectValue = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(objectValue).sort((left, right) => left.localeCompare(right))) {
      normalized[key] = this.normalizeJsonValue(objectValue[key]);
    }
    return normalized;
  }
}
