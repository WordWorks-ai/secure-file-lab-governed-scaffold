import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkerContentDerivativesService {
  generatePreview(contentType: string, plaintext: Buffer): string {
    const maxChars = this.getPreviewMaxChars();
    const normalizedType = contentType.toLowerCase();

    if (normalizedType.startsWith('text/') || normalizedType === 'application/json') {
      const text = plaintext.toString('utf8').replace(/\s+/g, ' ').trim();
      return text.slice(0, maxChars);
    }

    return `Preview unavailable for content type ${contentType}`;
  }

  extractOcrText(contentType: string, plaintext: Buffer): string {
    const maxChars = this.getOcrMaxChars();
    const normalizedType = contentType.toLowerCase();

    if (normalizedType.startsWith('text/') || normalizedType === 'application/json') {
      const text = plaintext.toString('utf8').replace(/\s+/g, ' ').trim();
      return text.slice(0, maxChars);
    }

    return '';
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
}
