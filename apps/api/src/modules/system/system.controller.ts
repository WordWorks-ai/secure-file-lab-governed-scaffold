import { Controller, Get } from '@nestjs/common';

@Controller('system')
export class SystemController {
  @Get('info')
  getInfo(): { service: string; phase: string } {
    return {
      service: 'api',
      phase: 'phase-1-scaffold',
    };
  }
}
