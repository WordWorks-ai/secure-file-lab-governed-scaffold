import { Body, Controller, Get, Post, UsePipes, ValidationPipe } from '@nestjs/common';

import { createValidationException } from '../../common/validation/validation-exception.factory.js';
import { EchoPayloadDto } from './dto/echo-payload.dto.js';

@Controller('system')
export class SystemController {
  @Get('info')
  getInfo(): { service: string; phase: string } {
    return {
      service: 'api',
      phase: 'phase-15-webhook-sink-baseline',
    };
  }

  @Post('echo')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      expectedType: EchoPayloadDto,
      exceptionFactory: createValidationException,
    }),
  )
  echoPayload(@Body() payload: EchoPayloadDto): { message: string } {
    return { message: payload.message };
  }
}
