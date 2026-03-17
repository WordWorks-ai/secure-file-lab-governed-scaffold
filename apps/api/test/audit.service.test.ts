import { AuditActorType, AuditResult, Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { AuditService } from '../src/modules/audit/audit.service.js';

type StoredAuditEvent = {
  id: string;
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
  prevEventHash: string | null;
  eventHash: string | null;
  chainVersion: string;
  createdAt: Date;
};

class InMemoryPrisma {
  readonly rows: StoredAuditEvent[] = [];

  readonly auditEvent = {
    findFirst: async (args: {
      where?: { eventHash?: { not: null } };
      orderBy?: Array<{ createdAt: 'asc' | 'desc' } | { id: 'asc' | 'desc' }>;
      select?: { eventHash?: true };
    }) => {
      let rows = [...this.rows];
      if (args.where?.eventHash?.not === null) {
        rows = rows.filter((row) => row.eventHash !== null);
      }

      rows.sort((left, right) => {
        for (const rule of args.orderBy ?? []) {
          if ('createdAt' in rule) {
            const delta = left.createdAt.getTime() - right.createdAt.getTime();
            if (delta !== 0) {
              return rule.createdAt === 'asc' ? delta : -delta;
            }
          } else if ('id' in rule) {
            const delta = left.id.localeCompare(right.id);
            if (delta !== 0) {
              return rule.id === 'asc' ? delta : -delta;
            }
          }
        }
        return 0;
      });

      const row = rows[0] ?? null;
      if (!row) {
        return null;
      }
      if (args.select?.eventHash) {
        return { eventHash: row.eventHash };
      }
      return { ...row };
    },
    create: async (args: { data: StoredAuditEvent }) => {
      this.rows.push({ ...args.data, createdAt: new Date(args.data.createdAt) });
      return { ...args.data };
    },
  };

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this);
  }

  readonly $executeRaw = async (...args: unknown[]): Promise<number> => {
    void args;
    return 1;
  };
}

describe('AuditService hash chain', () => {
  it('writes hash-chained audit events', async () => {
    const prisma = new InMemoryPrisma();
    const service = new AuditService(
      prisma as unknown as ConstructorParameters<typeof AuditService>[0],
    );

    await service.recordEvent({
      action: 'auth.login',
      resourceType: 'auth',
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: 'user-1',
      orgId: 'org-1',
      resourceId: null,
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
      metadata: { b: '2', a: '1' },
    });
    await service.recordEvent({
      action: 'file.download',
      resourceType: 'file',
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: 'user-1',
      orgId: 'org-1',
      resourceId: 'file-1',
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
      metadata: { nested: { z: 1, a: 2 } },
    });

    expect(prisma.rows).toHaveLength(2);
    const first = prisma.rows[0];
    const second = prisma.rows[1];

    expect(first.chainVersion).toBe('sha256-v1');
    expect(first.prevEventHash).toBeNull();
    expect(first.eventHash).toMatch(/^[a-f0-9]{64}$/);

    expect(second.chainVersion).toBe('sha256-v1');
    expect(second.prevEventHash).toBe(first.eventHash);
    expect(second.eventHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.eventHash).not.toBe(first.eventHash);
  });

  it('starts a new chain when only legacy unchained rows exist', async () => {
    const prisma = new InMemoryPrisma();
    prisma.rows.push({
      id: 'legacy-event',
      action: 'legacy.seed',
      resourceType: 'legacy',
      result: AuditResult.success,
      actorType: AuditActorType.system,
      actorUserId: null,
      orgId: null,
      resourceId: null,
      ipAddress: null,
      userAgent: null,
      metadataJson: {},
      prevEventHash: null,
      eventHash: null,
      chainVersion: 'sha256-v1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const service = new AuditService(
      prisma as unknown as ConstructorParameters<typeof AuditService>[0],
    );
    await service.recordEvent({
      action: 'auth.login',
      resourceType: 'auth',
      result: AuditResult.success,
      actorType: AuditActorType.user,
      actorUserId: 'user-2',
      orgId: 'org-2',
      resourceId: null,
      ipAddress: null,
      userAgent: null,
      metadata: {},
    });

    const latest = prisma.rows.at(-1);
    expect(latest).toBeDefined();
    expect(latest?.prevEventHash).toBeNull();
    expect(latest?.eventHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
