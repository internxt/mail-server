import {
  Catch,
  HttpException,
  type ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseError as SequelizeError } from 'sequelize';
import { errors as undiciErrors } from 'undici';
import { BaseExceptionFilter } from '@nestjs/core';
import { Request, Response } from 'express';
import type { UserPayload } from '../../modules/auth/jwt-payload.dto.js';

type AuthenticatedRequest = Request & { user?: UserPayload };

const MAX_DETAILS_LENGTH = 2000;

interface ErrorLike {
  name: string;
  message: string;
  stack?: string;
  details?: string;
  original?: { code?: string };
}

function toDetails(exception: unknown): string | undefined {
  const details = (exception as Record<string, unknown> | null)?.['details'];

  if (details == null) return undefined;

  const serialized =
    typeof details === 'string' ? details : safeStringify(details);

  return serialized.length > MAX_DETAILS_LENGTH
    ? `${serialized.slice(0, MAX_DETAILS_LENGTH)}…`
    : serialized;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function toErrorLike(exception: unknown): ErrorLike {
  const e = exception as Record<string, unknown>;
  return {
    name: typeof e['name'] === 'string' ? e['name'] : 'UnknownError',
    message:
      typeof e['message'] === 'string' ? e['message'] : String(exception),
    stack: typeof e['stack'] === 'string' ? e['stack'] : undefined,
    details: toDetails(exception),
    original:
      e['original'] != null && typeof e['original'] === 'object'
        ? {
            code: (e['original'] as Record<string, unknown>)['code'] as
              | string
              | undefined,
          }
        : undefined,
  };
}

@Catch()
export class HttpGlobalExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(HttpGlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost!;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<AuthenticatedRequest>();
    const response = ctx.getResponse<Response>();

    const requestId = request.id as string;

    try {
      if (requestId) {
        response.setHeader('x-request-id', requestId);
      }

      if (exception instanceof HttpException) {
        const status = exception.getStatus
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;

        const res = exception.getResponse();
        const message = this.isExceptionObject(res)
          ? res
          : { statusCode: exception.getStatus(), message: res };

        this.logger.error(
          {
            requestId,
            name: exception.name,
            path: request.url,
            method: request.method,
            error: { message: res, details: toDetails(exception) },
          },
          'HTTP_EXCEPTION',
        );
        httpAdapter.reply(response, message, status);
        return;
      }

      const err = toErrorLike(exception);

      if (this.isQueryTimeoutError(err)) {
        this.logger.warn(
          {
            requestId,
            path: request.url,
            method: request.method,
            errorType: 'QUERY_TIMEOUT',
            user: { uuid: request.user?.uuid },
            error: { message: err.message },
          },
          'QUERY_TIMEOUT',
        );

        httpAdapter.reply(
          response,
          {
            statusCode: HttpStatus.REQUEST_TIMEOUT,
            message: 'Request timed out',
            requestId,
          },
          HttpStatus.REQUEST_TIMEOUT,
        );
        return;
      }

      if (this.isDatabaseConnectionError(err)) {
        this.logDatabaseConnectionError(err, request, requestId);

        httpAdapter.reply(
          response,
          {
            statusCode: HttpStatus.SERVICE_UNAVAILABLE,
            message: 'Service temporarily unavailable',
            requestId,
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
        return;
      }

      this.logUnexpectedError(exception, err, request, requestId);

      httpAdapter.reply(
        response,
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal Server Error',
          requestId,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } catch (error: unknown) {
      const e = toErrorLike(error);
      this.logger.error(
        {
          requestId,
          user: { email: request.user?.email, uuid: request.user?.uuid },
          method: request.method,
          path: request.url,
          error: { message: e.message, stack: e.stack },
        },
        'Unexpected error in HttpGlobalExceptionFilter',
      );
      super.catch(error, host);
    }
  }

  isExceptionObject(err: any): err is Error {
    return (
      err !== null &&
      err !== undefined &&
      typeof err === 'object' &&
      'message' in err
    );
  }

  private isDatabaseConnectionError(err: ErrorLike): boolean {
    const connectionErrorNames = [
      'SequelizeConnectionAcquireTimeoutError',
      'SequelizeConnectionError',
      'SequelizeConnectionRefusedError',
      'SequelizeConnectionTimedOutError',
    ];
    return connectionErrorNames.includes(err.name);
  }

  private isQueryTimeoutError(err: ErrorLike): boolean {
    return err.message === 'Query timed out' || err.original?.code === '57014';
  }

  private logDatabaseConnectionError(
    err: ErrorLike,
    request: AuthenticatedRequest,
    requestId: string,
  ): void {
    this.logger.error(
      {
        requestId,
        name: err.name,
        path: request.url,
        errorType: 'DATABASE_CONNECTION_ERROR',
        method: request.method,
        user: { uuid: request.user?.uuid },
        error: { message: err.message },
      },
      'DATABASE_CONNECTION_ERROR',
    );
  }

  logUnexpectedError(
    exception: unknown,
    err: ErrorLike,
    request: AuthenticatedRequest,
    requestId: string,
  ): void {
    let errorSubtype = '';
    if (exception instanceof SequelizeError) {
      errorSubtype = 'DATABASE';
    } else if (exception instanceof undiciErrors.UndiciError) {
      errorSubtype = 'EXTERNAL_SERVICE';
    }

    const errorCategory = errorSubtype
      ? `UNEXPECTED_ERROR/${errorSubtype}`
      : 'UNEXPECTED_ERROR';

    this.logger.error(
      {
        requestId,
        name: err.name,
        path: request.url,
        errorType: errorCategory,
        method: request.method,
        body: (request.body ?? {}) as unknown,
        user: { email: request.user?.email, uuid: request.user?.uuid },
        error: { message: err.message, stack: err.stack, details: err.details },
      },
      errorCategory,
    );
  }
}
