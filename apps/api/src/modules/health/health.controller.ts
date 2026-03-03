import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';

import { DependencyHealthService } from './dependency-health.service.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DependencyHealthService)
    private readonly dependencyHealthService: DependencyHealthService,
  ) {}

  @Get('live')
  getLiveness(): { status: string; service: string } {
    return {
      status: 'ok',
      service: 'api',
    };
  }

  @Get('ready')
  async getReadiness(): Promise<{ status: 'ready'; dependencies: Array<{ name: string; ok: boolean }> }> {
    const result = await this.dependencyHealthService.checkAll();

    if (!result.ok) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        dependencies: result.dependencies,
      });
    }

    return {
      status: 'ready',
      dependencies: result.dependencies,
    };
  }
}
