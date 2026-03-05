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
