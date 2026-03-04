import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';

@Injectable()
export class WorkerMinioObjectStorageService {
  private readonly region = 'us-east-1';
  private readonly service = 's3';

  async getObject(storageKey: string): Promise<Buffer> {
    const endpoint = this.getEndpoint();
    const now = new Date();
    const amzDate = this.formatAmzDate(now);
    const dateStamp = this.formatDateStamp(now);
    const canonicalUri = `/${this.getBucket()}/${this.encodePath(storageKey)}`;
    const payloadHash =
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const headers: Record<string, string> = {
      host: endpoint.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };

    const signedHeaders = Object.keys(headers)
      .map((key) => key.toLowerCase())
      .sort()
      .join(';');
    const canonicalHeaders = Object.keys(headers)
      .map((key) => key.toLowerCase())
      .sort()
      .map((key) => `${key}:${headers[key].trim()}\n`)
      .join('');
    const canonicalRequest = [
      'GET',
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256Hex(canonicalRequest),
    ].join('\n');

    const signature = this.hmacHex(
      this.getSigningKey(this.getSecretKey(), dateStamp, this.region, this.service),
      stringToSign,
    );
    headers.authorization = [
      'AWS4-HMAC-SHA256',
      `Credential=${this.getAccessKey()}/${credentialScope},`,
      `SignedHeaders=${signedHeaders},`,
      `Signature=${signature}`,
    ].join(' ');

    const response = await fetch(`${endpoint.origin}${canonicalUri}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ServiceUnavailableException(`MinIO object GET failed (${response.status}): ${text}`);
    }

    const body = await response.arrayBuffer();
    return Buffer.from(body);
  }

  private getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
    const kDate = this.hmac(`AWS4${secretKey}`, dateStamp);
    const kRegion = this.hmac(kDate, region);
    const kService = this.hmac(kRegion, service);
    return this.hmac(kService, 'aws4_request');
  }

  private hmac(key: string | Buffer, value: string): Buffer {
    return createHmac('sha256', key).update(value, 'utf8').digest();
  }

  private hmacHex(key: string | Buffer, value: string): string {
    return createHmac('sha256', key).update(value, 'utf8').digest('hex');
  }

  private sha256Hex(input: string | Buffer): string {
    return createHash('sha256').update(input).digest('hex');
  }

  private formatAmzDate(value: Date): string {
    return value.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  private formatDateStamp(value: Date): string {
    return value.toISOString().slice(0, 10).replace(/-/g, '');
  }

  private getEndpoint(): URL {
    const raw = process.env.MINIO_ENDPOINT ?? 'http://minio:9000';
    return new URL(raw);
  }

  private getBucket(): string {
    return process.env.MINIO_BUCKET ?? 'secure-files';
  }

  private getAccessKey(): string {
    const value = process.env.MINIO_ROOT_USER;
    if (!value) {
      throw new ServiceUnavailableException('MINIO_ROOT_USER is required');
    }

    return value;
  }

  private getSecretKey(): string {
    const value = process.env.MINIO_ROOT_PASSWORD;
    if (!value) {
      throw new ServiceUnavailableException('MINIO_ROOT_PASSWORD is required');
    }

    return value;
  }

  private encodePath(storageKey: string): string {
    return storageKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
  }
}
