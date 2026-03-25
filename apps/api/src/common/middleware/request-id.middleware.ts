import { randomUUID } from 'node:crypto';

/**
 * OWASP A09 – Security Logging and Monitoring Failures
 *
 * Assigns a unique request ID (X-Request-Id) to every inbound request so that
 * log entries, audit events, and downstream service calls can be correlated.
 * If the client already supplies the header, the existing value is preserved
 * (useful for tracing through reverse proxies / API gateways).
 */
export function requestIdHook(request: { headers: Record<string, string | undefined> }): void {
  if (!request.headers['x-request-id']) {
    request.headers['x-request-id'] = randomUUID();
  }
}
