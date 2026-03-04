import { Injectable } from '@nestjs/common';

const STRUCTURED_TEXT_CONTENT_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/x-ndjson',
  'application/yaml',
  'application/x-yaml',
]);

@Injectable()
export class WorkerContentDerivativesService {
  generatePreview(contentType: string, plaintext: Buffer): string {
    const maxChars = this.getPreviewMaxChars();
    const extracted = this.extractDerivativeText(contentType, plaintext, maxChars);
    if (extracted.length > 0) {
      return extracted;
    }

    return `Preview unavailable for content type ${contentType}`;
  }

  extractOcrText(contentType: string, plaintext: Buffer): string {
    const maxChars = this.getOcrMaxChars();
    return this.extractDerivativeText(contentType, plaintext, maxChars);
  }

  private extractDerivativeText(contentType: string, plaintext: Buffer, maxChars: number): string {
    const normalizedType = contentType.toLowerCase();
    const boundedPayload = this.boundPayloadForDerivatives(plaintext);
    if (this.isTextContentType(normalizedType)) {
      return this.normalizeText(boundedPayload.toString('utf8')).slice(0, maxChars);
    }

    // Fallback for binary-ish payloads: salvage printable text where present.
    const printable = this.extractPrintableText(boundedPayload);
    return printable.slice(0, maxChars);
  }

  private boundPayloadForDerivatives(plaintext: Buffer): Buffer {
    const maxBytes = this.getMaxDerivativesBytes();
    if (plaintext.byteLength <= maxBytes) {
      return plaintext;
    }

    return plaintext.subarray(0, maxBytes);
  }

  private isTextContentType(normalizedType: string): boolean {
    return normalizedType.startsWith('text/') || STRUCTURED_TEXT_CONTENT_TYPES.has(normalizedType);
  }

  private normalizeText(value: string): string {
    const withoutNull = value.split('\u0000').join(' ');
    return withoutNull.replace(/\s+/g, ' ').trim();
  }

  private extractPrintableText(value: Buffer): string {
    const sanitizedBytes: number[] = [];
    for (const byte of value.values()) {
      if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) {
        sanitizedBytes.push(byte);
        continue;
      }

      sanitizedBytes.push(32);
    }

    return Buffer.from(sanitizedBytes).toString('utf8').replace(/\s+/g, ' ').trim();
  }

  private getPreviewMaxChars(): number {
    const raw = Number(process.env.CONTENT_PREVIEW_MAX_CHARS ?? 500);
    if (Number.isFinite(raw) && raw >= 64) {
      return Math.floor(raw);
    }

    return 500;
  }

  private getOcrMaxChars(): number {
    const raw = Number(process.env.CONTENT_OCR_MAX_CHARS ?? 2000);
    if (Number.isFinite(raw) && raw >= 128) {
      return Math.floor(raw);
    }

    return 2000;
  }

  private getMaxDerivativesBytes(): number {
    const raw = Number(process.env.CONTENT_DERIVATIVES_MAX_BYTES ?? 262_144);
    if (Number.isFinite(raw) && raw >= 1_024) {
      return Math.floor(raw);
    }

    return 262_144;
  }
}
