import { UserRole } from '@prisma/client';
import { SetMetadata } from '@nestjs/common';

export const ROLES_METADATA_KEY = 'roles';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_METADATA_KEY, roles);
