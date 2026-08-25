import {
  type ArgumentsHost,
  HttpException,
  HttpStatus,
  type Logger,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { ValidationError } from 'sequelize';
import { errors as undiciErrors } from 'undici';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { newUserPayload } from '../../../test/fixtures.js';
import { HttpGlobalExceptionFilter } from './http-global-exception.filter.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('HttpGlobalExceptionFilter', () => {
  let filter: HttpGlobalExceptionFilter;
  let mockHttpAdapter: DeepMocked<HttpAdapterHost['httpAdapter']>;
  let mockHttpAdapterHost: DeepMocked<HttpAdapterHost>;
  let loggerMock: DeepMocked<Logger>;

  beforeEach(async () => {
    mockHttpAdapter = createMock<HttpAdapterHost['httpAdapter']>();
    mockHttpAdapterHost = createMock<HttpAdapterHost>({
      httpAdapter: mockHttpAdapter,
    });
    loggerMock = createMock<Logger>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HttpGlobalExceptionFilter,
        {
          provide: HttpAdapterHost,
          useValue: mockHttpAdapterHost,
        },
      ],
    })
      .setLogger(loggerMock)
      .compile();
    filter = module.get<HttpGlobalExceptionFilter>(HttpGlobalExceptionFilter);
  });

  it('when HttpException is thrown, then formats response and logs', () => {
    const exceptionMessage = 'Test exception';
    const mockException = new HttpException(
      exceptionMessage,
      HttpStatus.BAD_REQUEST,
    );
    const mockHost = createMockArgumentsHost('/test-url', 'GET');

    filter.catch(mockException, mockHost);

    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message: exceptionMessage,
      },
      HttpStatus.BAD_REQUEST,
    );
  });

  it('when an HttpException carries upstream details, then they are logged alongside the response', () => {
    const mockException = Object.assign(
      new HttpException('Attachment upload limit reached', 429),
      { details: 'Quota exceeded: blob upload quota' },
    );
    const mockHost = createMockArgumentsHost('/email/attachment', 'POST');

    filter.catch(mockException, mockHost);

    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          details: 'Quota exceeded: blob upload quota',
        }) as unknown,
      }),
      'HTTP_EXCEPTION',
      'HttpGlobalExceptionFilter',
    );
    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      {
        statusCode: 429,
        message: 'Attachment upload limit reached',
      },
      429,
    );
  });

  describe('Non-HTTP errors', () => {
    it('when unexpected error is thrown, then logs details and returns 500', () => {
      const mockException = new Error('Unexpected error');
      const requestId = 'req-123';
      const mockHost = createMockArgumentsHost(
        '/test-url',
        'GET',
        newUserPayload(),
        {},
        requestId,
      );

      filter.catch(mockException, mockHost);

      expect(loggerMock.error).toHaveBeenCalled();
      expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal Server Error',
          requestId,
        }),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    });

    it('when an upstream error carries details, then the upstream body is logged', () => {
      const upstreamBody = JSON.stringify({
        status: 403,
        title: 'Quota exceeded',
      });
      const mockException = Object.assign(new Error('Blob upload failed'), {
        details: upstreamBody,
      });
      const mockHost = createMockArgumentsHost('/email/attachment', 'POST');

      filter.catch(mockException, mockHost);

      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: upstreamBody,
          }) as unknown,
        }),
        'UNEXPECTED_ERROR',
        'HttpGlobalExceptionFilter',
      );
    });

    it('when the upstream details are an object, then they are serialized for the log', () => {
      const mockException = Object.assign(new Error('JMAP method error'), {
        details: [['error', { type: 'stateMismatch' }, 'r0']],
      });
      const mockHost = createMockArgumentsHost('/email', 'POST');

      filter.catch(mockException, mockHost);

      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: '[["error",{"type":"stateMismatch"},"r0"]]',
          }) as unknown,
        }),
        'UNEXPECTED_ERROR',
        'HttpGlobalExceptionFilter',
      );
    });

    it('when the upstream details are unserializable, then logging still succeeds', () => {
      const circular: Record<string, unknown> = {};
      circular['self'] = circular;
      const mockException = Object.assign(new Error('JMAP method error'), {
        details: circular,
      });
      const mockHost = createMockArgumentsHost('/email', 'POST');

      filter.catch(mockException, mockHost);

      expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        }),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    });

    it('when SequelizeError is thrown, then logs with DATABASE tag', () => {
      const mockException = new ValidationError(
        'Database validation error',
        [],
      );
      const mockHost = createMockArgumentsHost(
        '/test-url',
        'GET',
        newUserPayload(),
      );

      filter.catch(mockException, mockHost);

      expect(loggerMock.error).toHaveBeenCalled();
      expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal Server Error',
        }),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    });

    it('when UndiciError is thrown, then logs with EXTERNAL_SERVICE tag', () => {
      const mockException = new undiciErrors.UndiciError(
        'External service error',
      );
      const mockHost = createMockArgumentsHost(
        '/test-url',
        'GET',
        newUserPayload(),
      );

      filter.catch(mockException, mockHost);

      expect(loggerMock.error).toHaveBeenCalled();
      expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal Server Error',
        }),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    });

    it('when a query timeout error is thrown, then responds with 408', () => {
      const mockException = new Error('Query timed out');
      const requestId = 'req-456';
      const mockHost = createMockArgumentsHost(
        '/test-url',
        'GET',
        newUserPayload(),
        {},
        requestId,
      );

      filter.catch(mockException, mockHost);

      expect(loggerMock.warn).toHaveBeenCalled();
      expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statusCode: HttpStatus.REQUEST_TIMEOUT,
          message: 'Request timed out',
          requestId,
        }),
        HttpStatus.REQUEST_TIMEOUT,
      );
    });

    it('when a postgres cancellation error (57014) is thrown, then responds with 408', () => {
      const mockException = {
        original: { code: '57014' },
        message: 'canceling statement due to statement timeout',
      };
      const requestId = 'req-789';
      const mockHost = createMockArgumentsHost(
        '/test-url',
        'GET',
        newUserPayload(),
        {},
        requestId,
      );

      filter.catch(mockException, mockHost);

      expect(loggerMock.warn).toHaveBeenCalled();
      expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statusCode: HttpStatus.REQUEST_TIMEOUT,
          message: 'Request timed out',
          requestId,
        }),
        HttpStatus.REQUEST_TIMEOUT,
      );
    });

    it('when request does not contain user, then handles it gracefully', () => {
      const mockException = new Error('Unexpected error');
      const mockHost = createMockArgumentsHost('/test-url', 'GET');

      filter.catch(mockException, mockHost);

      expect(loggerMock.error).toHaveBeenCalled();
      expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal Server Error',
        }),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    });
  });

  describe('Parent class fallback', () => {
    it('when an error occurs in the exception handler, then lets the parent class handle it', () => {
      const mockException = new Error('Original error');
      const mockHost = createMockArgumentsHost(
        '/test-url',
        'GET',
        newUserPayload(),
      );

      loggerMock.error.mockImplementationOnce(() => {
        throw new Error('Error in filter');
      });

      const superCatchSpy = vi
        .spyOn(BaseExceptionFilter.prototype, 'catch')
        .mockImplementation(() => undefined);

      filter.catch(mockException, mockHost);

      expect(superCatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Error in filter',
        }),
        mockHost,
      );

      superCatchSpy.mockRestore();
    });
  });

  describe('isExceptionObject', () => {
    it('when an object has a message property, then returns true', () => {
      expect(filter.isExceptionObject(new Error('test'))).toBe(true);
      expect(filter.isExceptionObject({ message: 'test message' })).toBe(true);
    });

    it('when an object has no message property, then returns false', () => {
      expect(filter.isExceptionObject({ something: 'else' })).toBe(false);
      expect(filter.isExceptionObject(null)).toBe(false);
      expect(filter.isExceptionObject(undefined)).toBe(false);
    });
  });
});

function createMockArgumentsHost(
  url: string,
  method: string,
  user?: ReturnType<typeof newUserPayload>,
  body: Record<string, unknown> = {},
  id = 'req-default',
) {
  return createMock<ArgumentsHost>({
    switchToHttp: () => ({
      getRequest: () => ({
        url,
        method,
        user,
        body,
        id,
      }),
      getResponse: () => ({ setHeader: vi.fn() }),
    }),
  });
}
