import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';

import { RequestLoggingInterceptor } from '../common/logging/request-logging.interceptor.js';
import { createValidationException } from '../common/validation/validation-exception.factory.js';

export function configureApiApplication(app: INestApplication): void {
  validateRequiredSecrets();

  app.setGlobalPrefix('v1');
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
      forbidNonWhitelisted: true,
      exceptionFactory: createValidationException,
    }),
  );
}

export function validateRequiredSecrets(): void {
  const required = ['JWT_ACCESS_SECRET', 'MFA_TOTP_SECRET_KEY'];
  const missing = required.filter(
    (name) => !process.env[name] || process.env[name]!.trim().length === 0,
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'The API cannot start without these secrets configured.',
    );
  }

  const MIN_SECRET_LENGTH = 32;
  const weak = required.filter(
    (name) => process.env[name]!.trim().length < MIN_SECRET_LENGTH,
  );
  if (weak.length > 0) {
    throw new Error(
      `Weak secrets detected: ${weak.join(', ')} must be at least ${MIN_SECRET_LENGTH} characters.`,
    );
  }

  const secretEntries: Array<[string, string]> = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'MINIO_ROOT_PASSWORD',
    'MFA_TOTP_SECRET_KEY',
  ]
    .filter((name) => process.env[name] && process.env[name]!.trim().length > 0)
    .map((name) => [name, process.env[name]!.trim()]);

  const seen = new Map<string, string>();
  for (const [name, value] of secretEntries) {
    const existing = seen.get(value);
    if (existing) {
      throw new Error(
        `Secret reuse detected: ${name} and ${existing} share the same value. ` +
          'Each secret must be a distinct value.',
      );
    }
    seen.set(value, name);
  }

  if (process.env.VAULT_DEV_ROOT_TOKEN) {
    Logger.warn(
      'VAULT_DEV_ROOT_TOKEN is set. Dev-mode Vault tokens are not suitable for production.',
      'SecurityAudit',
    );
  }
}
