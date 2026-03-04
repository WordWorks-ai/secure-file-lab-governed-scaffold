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
}
