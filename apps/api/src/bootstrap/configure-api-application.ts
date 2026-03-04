import { INestApplication, ValidationPipe } from '@nestjs/common';

import { RequestLoggingInterceptor } from '../common/logging/request-logging.interceptor.js';
import { createValidationException } from '../common/validation/validation-exception.factory.js';

export function configureApiApplication(app: INestApplication): void {
  app.setGlobalPrefix('v1');
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
      forbidNonWhitelisted: true,
      exceptionFactory: createValidationException,
    }),
  );
}
