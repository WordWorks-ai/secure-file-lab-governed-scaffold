import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { validateRequiredSecrets } from '../src/bootstrap/configure-api-application.js';

describe('validateRequiredSecrets', () => {
  const originalEnv = { ...process.env };
  const VALID_SECRET_A = 'test-jwt-secret-at-least-32-characters-long';
  const VALID_SECRET_B = 'test-mfa-secret-at-least-32-characters-long';

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = VALID_SECRET_A;
    process.env.MFA_TOTP_SECRET_KEY = VALID_SECRET_B;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.MINIO_ROOT_PASSWORD;
    delete process.env.VAULT_DEV_ROOT_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('passes with all required secrets set and strong', () => {
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

  it('throws when JWT_ACCESS_SECRET is too short', () => {
    process.env.JWT_ACCESS_SECRET = 'short';
    expect(() => validateRequiredSecrets()).toThrow('Weak secrets detected: JWT_ACCESS_SECRET');
  });

  it('throws when MFA_TOTP_SECRET_KEY is too short', () => {
    process.env.MFA_TOTP_SECRET_KEY = 'short-mfa-key';
    expect(() => validateRequiredSecrets()).toThrow('Weak secrets detected');
  });

  it('throws when both secrets are too short', () => {
    process.env.JWT_ACCESS_SECRET = 'short-a';
    process.env.MFA_TOTP_SECRET_KEY = 'short-b';
    expect(() => validateRequiredSecrets()).toThrow('JWT_ACCESS_SECRET, MFA_TOTP_SECRET_KEY');
  });

  it('throws when JWT_ACCESS_SECRET and MINIO_ROOT_PASSWORD share the same value', () => {
    process.env.MINIO_ROOT_PASSWORD = VALID_SECRET_A;
    expect(() => validateRequiredSecrets()).toThrow('Secret reuse detected');
  });

  it('throws when JWT_ACCESS_SECRET and MFA_TOTP_SECRET_KEY share the same value', () => {
    process.env.JWT_ACCESS_SECRET = 'shared-value-that-is-at-least-32-characters';
    process.env.MFA_TOTP_SECRET_KEY = 'shared-value-that-is-at-least-32-characters';
    expect(() => validateRequiredSecrets()).toThrow('Secret reuse detected');
  });

  it('throws when JWT_ACCESS_SECRET and JWT_REFRESH_SECRET share the same value', () => {
    process.env.JWT_REFRESH_SECRET = VALID_SECRET_A;
    expect(() => validateRequiredSecrets()).toThrow('Secret reuse detected');
  });

  it('passes when all secrets are distinct and strong', () => {
    process.env.JWT_ACCESS_SECRET = 'secret-aaaa-bbbb-cccc-dddd-eeee-ffff-1';
    process.env.JWT_REFRESH_SECRET = 'secret-aaaa-bbbb-cccc-dddd-eeee-ffff-2';
    process.env.MINIO_ROOT_PASSWORD = 'secret-aaaa-bbbb-cccc-dddd-eeee-ffff-3';
    process.env.MFA_TOTP_SECRET_KEY = 'secret-aaaa-bbbb-cccc-dddd-eeee-ffff-4';
    expect(() => validateRequiredSecrets()).not.toThrow();
  });

  it('ignores undefined optional secrets in distinctness check', () => {
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.MINIO_ROOT_PASSWORD;
    expect(() => validateRequiredSecrets()).not.toThrow();
  });
});
