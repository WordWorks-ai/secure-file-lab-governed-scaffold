import { FileStatus } from '@prisma/client';
import { Inject, Injectable } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/types/authenticated-request.js';
import { PrismaService } from '../persistence/prisma.service.js';

type SearchHit = {
  id: string;
  filename: string;
  contentType: string;
  status: FileStatus;
  orgId: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
  score: number | null;
};

@Injectable()
export class SearchService {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  async searchFiles(
    query: string,
    user: AuthenticatedUser,
    limit?: number,
  ): Promise<{ source: string; count: number; items: SearchHit[] }> {
    const normalizedQuery = query.trim();
    const safeLimit = this.resolveLimit(limit);
    const orgIds = await this.getActorOrgIds(user.sub);

    if (orgIds.length === 0) {
      return {
        source: 'none',
        count: 0,
        items: [],
      };
    }

    if (this.isOpenSearchEnabled()) {
      try {
        const indexed = await this.searchViaOpenSearch(normalizedQuery, orgIds, safeLimit);
        return {
          source: 'opensearch',
          count: indexed.length,
          items: indexed,
        };
      } catch {
        if (!this.allowFallbackToDatabase()) {
          throw new Error('OpenSearch query failed and fallback is disabled');
        }
      }
    }

    const rows = await this.prismaService.file.findMany({
      where: {
        orgId: {
          in: orgIds,
        },
        OR: [
          {
            filename: {
              contains: normalizedQuery,
              mode: 'insensitive',
            },
          },
          {
            contentType: {
              contains: normalizedQuery,
              mode: 'insensitive',
            },
          },
        ],
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: safeLimit,
    });

    return {
      source: this.isOpenSearchEnabled() ? 'db-fallback' : 'db-disabled',
      count: rows.length,
      items: rows.map((row) => ({
        id: row.id,
        filename: row.filename,
        contentType: row.contentType,
        status: row.status,
        orgId: row.orgId,
        ownerUserId: row.ownerUserId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        score: null,
      })),
    };
  }

  private async searchViaOpenSearch(
    query: string,
    orgIds: string[],
    limit: number,
  ): Promise<SearchHit[]> {
    const endpoint = `${this.getOpenSearchBaseUrl()}/${this.getFileIndexName()}/_search`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        size: limit,
        query: {
          bool: {
            must: [
              {
                simple_query_string: {
                  query,
                  fields: ['filename^2', 'contentType', 'status'],
                },
              },
            ],
            filter: [
              {
                terms: {
                  orgId: orgIds,
                },
              },
            ],
          },
        },
        sort: [{ _score: 'desc' }, { updatedAt: 'desc' }],
      }),
    });

    if (!response.ok) {
      throw new Error(`opensearch query failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      hits?: { hits?: Array<{ _id?: string; _score?: number; _source?: Record<string, unknown> }> };
    };

    const hits = payload.hits?.hits ?? [];
    return hits
      .map((hit) => {
        const source = hit._source ?? {};
        const status = this.parseFileStatus(source.status);
        if (!status) {
          return null;
        }

        return {
          id: typeof source.id === 'string' ? source.id : hit._id ?? '',
          filename: typeof source.filename === 'string' ? source.filename : '',
          contentType: typeof source.contentType === 'string' ? source.contentType : 'application/octet-stream',
          status,
          orgId: typeof source.orgId === 'string' ? source.orgId : '',
          ownerUserId: typeof source.ownerUserId === 'string' ? source.ownerUserId : '',
          createdAt:
            typeof source.createdAt === 'string' ? source.createdAt : new Date(0).toISOString(),
          updatedAt:
            typeof source.updatedAt === 'string' ? source.updatedAt : new Date(0).toISOString(),
          score: typeof hit._score === 'number' ? hit._score : null,
        } satisfies SearchHit;
      })
      .filter((value): value is SearchHit => value !== null && value.id.length > 0);
  }

  private async getActorOrgIds(userId: string): Promise<string[]> {
    const memberships = await this.prismaService.membership.findMany({
      where: {
        userId,
      },
      select: {
        orgId: true,
      },
      take: 100,
    });

    return memberships.map((membership) => membership.orgId);
  }

  private resolveLimit(value: number | undefined): number {
    if (!value || !Number.isFinite(value) || value < 1) {
      return 20;
    }

    return Math.min(Math.floor(value), 100);
  }

  private parseFileStatus(value: unknown): FileStatus | null {
    if (typeof value !== 'string') {
      return null;
    }

    const allowed: FileStatus[] = [
      FileStatus.created,
      FileStatus.stored,
      FileStatus.quarantined,
      FileStatus.scan_pending,
      FileStatus.active,
      FileStatus.blocked,
      FileStatus.expired,
      FileStatus.deleted,
    ];

    return allowed.includes(value as FileStatus) ? (value as FileStatus) : null;
  }

  private isOpenSearchEnabled(): boolean {
    return (process.env.OPENSEARCH_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  }

  private allowFallbackToDatabase(): boolean {
    return (process.env.OPENSEARCH_FAIL_SAFE_DB_FALLBACK ?? 'true').trim().toLowerCase() === 'true';
  }

  private getOpenSearchBaseUrl(): string {
    return (process.env.OPENSEARCH_BASE_URL ?? 'http://opensearch:9200').replace(/\/+$/, '');
  }

  private getFileIndexName(): string {
    return process.env.OPENSEARCH_FILES_INDEX ?? 'files-v1';
  }
}
