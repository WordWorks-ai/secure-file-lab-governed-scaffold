import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtTokenService } from '../jwt-token.service.js';
import { AuthenticatedRequest } from '../types/authenticated-request.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(JwtTokenService) private readonly jwtTokenService: JwtTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    try {
      request.user = this.jwtTokenService.verifyAccessToken(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  private extractBearerToken(request: AuthenticatedRequest): string {
    const authorization = request.headers?.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!value) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const [scheme, token] = value.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    return token.trim();
  }
}
