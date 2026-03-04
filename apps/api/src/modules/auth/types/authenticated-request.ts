import { UserRole } from '@prisma/client';

export type AuthenticatedUser = {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access';
  iat: number;
  exp: number;
};

export type AuthenticatedRequest = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
  user?: AuthenticatedUser;
};
