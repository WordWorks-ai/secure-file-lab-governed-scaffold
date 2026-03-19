import { UnauthorizedException } from '@nestjs/common';

import { AuthenticatedRequest, AuthenticatedUser } from '../modules/auth/types/authenticated-request.js';

export type RequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export function getRequestContext(request: AuthenticatedRequest): RequestContext {
  const header = request.headers?.['user-agent'];
  const userAgent = Array.isArray(header) ? header[0] : header;
  return {
    ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
    userAgent: userAgent ?? null,
  };
}

export function requireAuthenticatedUser(request: AuthenticatedRequest): AuthenticatedUser {
  if (!request.user) {
    throw new UnauthorizedException('Invalid access token');
  }
  return request.user;
}
