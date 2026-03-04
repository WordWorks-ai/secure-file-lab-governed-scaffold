import { FileStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';

type FileDocument = {
  id: string;
  filename: string;
  contentType: string;
  status: FileStatus;
  orgId: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class WorkerOpenSearchIndexService {
  private initialized = false;

  async ensureIndex(): Promise<void> {
    if (!this.isEnabled() || this.initialized) {
      return;
    }

    const endpoint = `${this.getBaseUrl()}/${this.getFilesIndexName()}`;
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        settings: {
          index: {
            number_of_shards: 1,
            number_of_replicas: 0,
          },
        },
        mappings: {
          properties: {
            id: { type: 'keyword' },
            orgId: { type: 'keyword' },
            ownerUserId: { type: 'keyword' },
            filename: { type: 'text' },
            contentType: { type: 'keyword' },
            status: { type: 'keyword' },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' },
          },
        },
      }),
    });

    if (response.status === 200 || response.status === 201 || response.status === 400) {
      this.initialized = true;
      return;
    }

    throw new Error(`opensearch ensure index failed: ${response.status}`);
  }

  async upsertFile(document: FileDocument): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const endpoint = `${this.getBaseUrl()}/${this.getFilesIndexName()}/_doc/${encodeURIComponent(document.id)}`;
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(document),
    });

    if (!response.ok) {
      throw new Error(`opensearch upsert failed: ${response.status}`);
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const endpoint = `${this.getBaseUrl()}/${this.getFilesIndexName()}/_doc/${encodeURIComponent(fileId)}`;
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`opensearch delete failed: ${response.status}`);
    }
  }

  isEnabled(): boolean {
    return (process.env.OPENSEARCH_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  }

  private getBaseUrl(): string {
    return (process.env.OPENSEARCH_BASE_URL ?? 'http://opensearch:9200').replace(/\/+$/, '');
  }

  private getFilesIndexName(): string {
    return process.env.OPENSEARCH_FILES_INDEX ?? 'files-v1';
  }
}
