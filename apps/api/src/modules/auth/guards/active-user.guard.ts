import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../../persistence/prisma.service.js';
import { AuthenticatedRequest } from '../types/authenticated-request.js';

@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new UnauthorizedException('Authentication required');
    }

    const user = await this.prismaService.user.findUnique({
      where: { id: request.user.sub },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account is not active');
    }

    return true;
  }
}
