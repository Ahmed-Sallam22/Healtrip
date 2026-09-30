import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { ApiErrorBody, ApiErrorCode } from '@healtrip/shared';
import type { Request, Response } from 'express';
import { ERROR_MESSAGES } from './messages';

const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  400: 'VALIDATION_ERROR',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
  503: 'DB_UNAVAILABLE',
};

/** Maps any thrown error to the consistent bilingual envelope { code, message, messageAr, requestId }. */
export function toApiError(err: unknown, requestId: string): { status: number; body: ApiErrorBody } {
  let status = HttpStatus.INTERNAL_SERVER_ERROR;
  let code: ApiErrorCode = 'INTERNAL_ERROR';
  let details: unknown;
  let message: string | undefined;

  if (err instanceof ThrottlerException) {
    status = 429;
    code = 'RATE_LIMITED';
  } else if (err instanceof HttpException) {
    status = err.getStatus();
    const res = err.getResponse() as { code?: ApiErrorCode; details?: unknown; message?: unknown } | string;
    code = (typeof res === 'object' && res.code) || STATUS_TO_CODE[status] || (status < 500 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR');
    if (typeof res === 'object') {
      details = res.details;
      if (typeof res.message === 'string' && status < 500) message = res.message;
    }
  } else if (
    err instanceof Prisma.PrismaClientInitializationError ||
    (err instanceof Prisma.PrismaClientKnownRequestError && ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(err.code))
  ) {
    status = HttpStatus.SERVICE_UNAVAILABLE;
    code = 'DB_UNAVAILABLE';
  }

  const text = ERROR_MESSAGES[code];
  return { status, body: { code, message: message ?? text.en, messageAr: text.ar, requestId, ...(details ? { details } : {}) } };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const { status, body } = toApiError(exception, String(req.id ?? 'unknown'));
    if (status >= 500) this.logger.error({ err: exception, requestId: body.requestId }, `Unhandled error: ${(exception as Error)?.message}`);
    if (res.headersSent) return; // e.g. SSE already streaming — the stream handler reports errors itself
    res.status(status).json(body);
  }
}
