import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkerContentDerivativesService } from '../src/modules/jobs/services/worker-content-derivatives.service.js';

describe('WorkerContentDerivativesService', () => {
  let originalPreviewMaxChars: string | undefined;
  let originalOcrMaxChars: string | undefined;
  let originalMaxDerivativeBytes: string | undefined;

  beforeEach(() => {
    originalPreviewMaxChars = process.env.CONTENT_PREVIEW_MAX_CHARS;
    originalOcrMaxChars = process.env.CONTENT_OCR_MAX_CHARS;
    originalMaxDerivativeBytes = process.env.CONTENT_DERIVATIVES_MAX_BYTES;
  });

  afterEach(() => {
    if (originalPreviewMaxChars === undefined) {
      delete process.env.CONTENT_PREVIEW_MAX_CHARS;
    } else {
      process.env.CONTENT_PREVIEW_MAX_CHARS = originalPreviewMaxChars;
    }

    if (originalOcrMaxChars === undefined) {
      delete process.env.CONTENT_OCR_MAX_CHARS;
    } else {
      process.env.CONTENT_OCR_MAX_CHARS = originalOcrMaxChars;
    }

    if (originalMaxDerivativeBytes === undefined) {
      delete process.env.CONTENT_DERIVATIVES_MAX_BYTES;
    } else {
      process.env.CONTENT_DERIVATIVES_MAX_BYTES = originalMaxDerivativeBytes;
    }
  });

  it('normalizes text preview whitespace and null bytes', () => {
    process.env.CONTENT_PREVIEW_MAX_CHARS = '64';
    const service = new WorkerContentDerivativesService();

    const preview = service.generatePreview(
      'text/plain',
      Buffer.from('  alpha\n\tbeta\u0000gamma  ', 'utf8'),
    );

    expect(preview).toBe('alpha beta gamma');
  });

  it('extracts printable fallback text for binary-ish OCR payloads', () => {
    process.env.CONTENT_OCR_MAX_CHARS = '64';
    const service = new WorkerContentDerivativesService();

    const ocrText = service.extractOcrText(
      'application/pdf',
      Buffer.from([0x00, 0x41, 0x42, 0x43, 0x0a, 0x44, 0xff, 0x45]),
    );

    expect(ocrText).toBe('ABC D E');
  });

  it('returns an unavailable message when preview text cannot be derived', () => {
    const service = new WorkerContentDerivativesService();

    const preview = service.generatePreview('application/octet-stream', Buffer.alloc(64, 0));

    expect(preview).toBe('Preview unavailable for content type application/octet-stream');
  });

  it('caps derivative extraction by CONTENT_DERIVATIVES_MAX_BYTES', () => {
    process.env.CONTENT_PREVIEW_MAX_CHARS = '4096';
    process.env.CONTENT_DERIVATIVES_MAX_BYTES = '1024';
    const service = new WorkerContentDerivativesService();

    const preview = service.generatePreview('text/plain', Buffer.from('a'.repeat(1500), 'utf8'));

    expect(preview).toHaveLength(1024);
  });
});
