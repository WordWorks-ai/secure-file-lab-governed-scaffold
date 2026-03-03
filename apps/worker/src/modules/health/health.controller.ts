import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  getLiveness(): { status: string; service: string } {
    return {
      status: 'ok',
      service: 'worker',
    };
  }
}
