import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';

/**
 * OWASP A05 – Security Misconfiguration
 *
 * Catch-all exception filter that prevents internal implementation details,
 * stack traces, or service topology from leaking to HTTP clients.
 * Only HttpException subclasses propagate their original status and message;
 * everything else becomes a generic 500.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // NestJS HttpExceptions are safe to forward – they were explicitly thrown
      // by application code with controlled messages.
      response.status(status).send(
        typeof body === 'string' ? { statusCode: status, message: body } : body,
      );
      return;
    }

    // Log the real error for operators but never expose it to the client.
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(500).send({
      statusCode: 500,
      message: 'Internal server error',
    });
  }
}
