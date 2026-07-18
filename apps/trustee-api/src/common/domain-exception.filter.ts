import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { IdempotencyConflictError } from '../infra/idempotency.service';

/**
 * Maps domain and framework errors to safe HTTP responses. Domain guard errors
 * carry structured reasons; nothing sensitive is leaked (§37).
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json(this.body(status, exception.getResponse()));
      return;
    }
    if (exception instanceof IdempotencyConflictError) {
      res.status(HttpStatus.CONFLICT).json(this.body(HttpStatus.CONFLICT, exception.message));
      return;
    }
    const message = exception instanceof Error ? exception.message : 'Internal error';
    this.logger.error(message);
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(this.body(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal error'));
  }

  private body(status: number, detail: unknown): Record<string, unknown> {
    const payload = typeof detail === 'string' ? { message: detail } : (detail as object);
    return { statusCode: status, ...payload };
  }
}
