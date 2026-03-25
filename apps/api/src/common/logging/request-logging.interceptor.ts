import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('RequestLog');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<{
      method?: string;
      url?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const response = httpContext.getResponse<{ statusCode?: number }>();

    const method = request?.method ?? 'UNKNOWN';
    const path = request?.url ?? 'UNKNOWN';
    // OWASP A09 – Include request ID for log correlation.
    const requestId = this.extractHeader(request?.headers, 'x-request-id');

    return next.handle().pipe(
      tap(() => {
        this.logRequest({
          requestId,
          method,
          path,
          statusCode: response?.statusCode ?? 200,
          durationMs: Date.now() - startedAt,
        });
      }),
      catchError((error: unknown) => {
        this.logRequest({
          requestId,
          method,
          path,
          statusCode: error instanceof HttpException ? error.getStatus() : 500,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : 'unknown_error',
        });

        return throwError(() => error);
      }),
    );
  }

  private extractHeader(
    headers: Record<string, string | string[] | undefined> | undefined,
    name: string,
  ): string | undefined {
    const value = headers?.[name];
    return Array.isArray(value) ? value[0] : value;
  }

  private logRequest(payload: {
    requestId?: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    error?: string;
  }): void {
    this.logger.log(JSON.stringify(payload));
  }
}
