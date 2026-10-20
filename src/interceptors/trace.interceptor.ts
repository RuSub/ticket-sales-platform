import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { logStorage } from '../common/logger/log-context';

@Injectable()
export class TraceIdInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TraceIdInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Global interceptors also run for WebSocket handlers, where there is no
    // HTTP request/response pair. Without this guard every WS event crashed
    // with "Cannot read properties of undefined (reading 'x-trace-id')".
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const traceId = (request?.headers?.['x-trace-id'] as string) || uuidv4();
    const userId = request?.user?.userId as string | undefined;

    // Add traceId to response headers
    const response = context.switchToHttp().getResponse();
    response?.setHeader?.('X-Trace-Id', traceId);

    const startTime = Date.now();

    // Bind the context to the whole request async flow (subscription of the
    // handler happens after the interceptor returns, so run() would lose it).
    logStorage.enterWith({ traceId, userId });

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        this.logger.debug(
          `${request.method} ${request.url} ${response.statusCode} ${duration}ms [trace:${traceId}]`,
        );
      }),
    );
  }
}
