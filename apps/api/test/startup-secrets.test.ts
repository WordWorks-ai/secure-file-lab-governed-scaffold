import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { validateRequiredSecrets } from '../src/bootstrap/configure-api-application.js';

describe('validateRequiredSecrets', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
    process.env.MFA_TOTP_SECRET_KEY = 'test-mfa-secret';
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.MINIO_ROOT_PASSWORD;
    delete process.env.VAULT_DEV_ROOT_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('passes with all required secrets set', () => {
    expect(() => validateRequiredSecrets()).not.toThrow();
  });

  it('throws when JWT_ACCESS_SECRET is missing', () => {
    delete process.env.JWT_ACCESS_SECRET;
    expect(() => validateRequiredSecrets()).toThrow('Missing required environment variables: JWT_ACCESS_SECRET');
  });

  it('throws when JWT_ACCESS_SECRET is empty', () => {
    process.env.JWT_ACCESS_SECRET = '  ';
    expect(() => validateRequiredSecrets()).toThrow('Missing required environment variables: JWT_ACCESS_SECRET');
  });

  it('throws when MFA_TOTP_SECRET_KEY is missing', () => {
    delete process.env.MFA_TOTP_SECRET_KEY;
    expect(() => validateRequiredSecrets()).toThrow('Missing required environment variables: MFA_TOTP_SECRET_KEY');
  });

  it('throws when MFA_TOTP_SECRET_KEY is empty', () => {
    process.env.MFA_TOTP_SECRET_KEY = '';
    expect(() => validateRequiredSecrets()).toThrow('Missing required environment variables: MFA_TOTP_SECRET_KEY');
  });

  it('throws when both required secrets are missing', () => {
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.MFA_TOTP_SECRET_KEY;
    expect(() => validateRequiredSecrets()).toThrow('JWT_ACCESS_SECRET, MFA_TOTP_SECRET_KEY');
  });

  it('throws when JWT_ACCESS_SECRET and MINIO_ROOT_PASSWORD share the same value', () => {
    process.env.JWT_ACCESS_SECRET = 'shared-value';
    process.env.MINIO_ROOT_PASSWORD = 'shared-value';
    expect(() => validateRequiredSecrets()).toThrow('Secret reuse detected');
  });

  it('throws when JWT_ACCESS_SECRET and MFA_TOTP_SECRET_KEY share the same value', () => {
    process.env.JWT_ACCESS_SECRET = 'same-secret';
    process.env.MFA_TOTP_SECRET_KEY = 'same-secret';
    expect(() => validateRequiredSecrets()).toThrow('Secret reuse detected');
  });

  it('throws when JWT_ACCESS_SECRET and JWT_REFRESH_SECRET share the same value', () => {
    process.env.JWT_REFRESH_SECRET = 'test-jwt-secret';
    expect(() => validateRequiredSecrets()).toThrow('Secret reuse detected');
  });

  it('passes when all secrets are distinct', () => {
    process.env.JWT_ACCESS_SECRET = 'secret-a';
    process.env.JWT_REFRESH_SECRET = 'secret-b';
    process.env.MINIO_ROOT_PASSWORD = 'secret-c';
    process.env.MFA_TOTP_SECRET_KEY = 'secret-d';
    expect(() => validateRequiredSecrets()).not.toThrow();
  });

  it('ignores undefined optional secrets in distinctness check', () => {
    process.env.JWT_ACCESS_SECRET = 'secret-a';
    process.env.MFA_TOTP_SECRET_KEY = 'secret-b';
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.MINIO_ROOT_PASSWORD;
    expect(() => validateRequiredSecrets()).not.toThrow();
  });
});
