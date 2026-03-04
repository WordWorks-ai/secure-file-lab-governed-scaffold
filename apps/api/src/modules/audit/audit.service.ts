import { AuditActorType, AuditResult, Prisma } from '@prisma/client';
import { Inject, Injectable, Logger } from '@nestjs/common';

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

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  async recordEvent(input: AuditEventInput): Promise<void> {
    try {
      await this.prismaService.auditEvent.create({
        data: {
          action: input.action,
          resourceType: input.resourceType,
          result: input.result,
          actorType: input.actorType,
          actorUserId: input.actorUserId ?? null,
          orgId: input.orgId ?? null,
          resourceId: input.resourceId ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          metadataJson: input.metadata ?? {},
        },
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
      createdAt: Date;
    }>
  > {
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

    const take = this.normalizeLimit(input.limit);
    return this.prismaService.auditEvent.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take,
    });
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
}
