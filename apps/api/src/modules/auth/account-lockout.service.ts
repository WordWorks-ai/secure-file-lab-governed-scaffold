import { Injectable, Logger } from '@nestjs/common';

/**
 * OWASP A07 – Identification and Authentication Failures
 * OWASP ASVS 2.2.1 – Account lockout after repeated failed login attempts
 *
 * In-memory progressive lockout that tracks failed login attempts per email.
 * After MAX_ATTEMPTS consecutive failures within the window, the account is
 * temporarily locked for a configurable duration. The counter resets on
 * successful authentication.
 *
 * Production note: For horizontally-scaled deployments, replace with a
 * Redis-backed implementation so lockout state is shared across instances.
 */
@Injectable()
export class AccountLockoutService {
  private readonly logger = new Logger(AccountLockoutService.name);

  private readonly maxAttempts: number;
  private readonly lockoutDurationMs: number;
  private readonly windowMs: number;

  /** email → { failures: timestamp[] ; lockedUntil: number | null } */
  private readonly state = new Map<string, { failures: number[]; lockedUntil: number | null }>();

  constructor() {
    this.maxAttempts = Number(process.env.AUTH_LOCKOUT_MAX_ATTEMPTS ?? 5);
    this.lockoutDurationMs = Number(process.env.AUTH_LOCKOUT_DURATION_MS ?? 15 * 60 * 1000); // 15 min
    this.windowMs = Number(process.env.AUTH_LOCKOUT_WINDOW_MS ?? 15 * 60 * 1000); // 15 min
  }

  /**
   * Returns true if the account is currently locked out.
   */
  isLockedOut(email: string): boolean {
    const entry = this.state.get(email);
    if (!entry?.lockedUntil) return false;

    if (Date.now() >= entry.lockedUntil) {
      // Lockout expired — clear state
      this.state.delete(email);
      return false;
    }

    return true;
  }

  /**
   * Record a failed login attempt. Returns true if the account is now locked.
   */
  recordFailure(email: string): boolean {
    const now = Date.now();
    const entry = this.state.get(email) ?? { failures: [], lockedUntil: null };

    // Prune failures outside the sliding window
    entry.failures = entry.failures.filter((ts) => now - ts < this.windowMs);
    entry.failures.push(now);

    if (entry.failures.length >= this.maxAttempts) {
      entry.lockedUntil = now + this.lockoutDurationMs;
      this.logger.warn(`Account locked out: ${email} (${entry.failures.length} failures in window)`);
    }

    this.state.set(email, entry);
    return entry.lockedUntil !== null && now < entry.lockedUntil;
  }

  /**
   * Reset the failure counter on successful login.
   */
  recordSuccess(email: string): void {
    this.state.delete(email);
  }

  /**
   * Returns remaining lockout time in seconds, or 0 if not locked.
   */
  getRemainingLockoutSeconds(email: string): number {
    const entry = this.state.get(email);
    if (!entry?.lockedUntil) return 0;
    const remaining = entry.lockedUntil - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }
}
