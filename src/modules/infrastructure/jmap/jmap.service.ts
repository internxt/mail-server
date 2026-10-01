import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Dispatcher, Pool } from 'undici';
import { PassThrough, type Readable } from 'node:stream';
import type {
  DownloadAttachmentPayload,
  DownloadAttachmentResponse,
  ID,
  JmapInvocation,
  JmapMethodCall,
  JmapRequest,
  JmapResponse,
  JmapSession,
  UploadAttachmentPayload,
  UploadAttachmentResponse,
} from './jmap.types.js';
import { emailDomain } from '../../../common/logging/pii.js';
import {
  MailProviderTimeoutError,
  MailProviderUnavailableError,
} from '../../email/mail-provider.port.js';

const JMAP_CAPABILITY_CORE = 'urn:ietf:params:jmap:core';
const JMAP_CAPABILITY_MAIL = 'urn:ietf:params:jmap:mail';
const JMAP_CAPABILITY_SUBMISSION = 'urn:ietf:params:jmap:submission';
export const JMAP_CAPABILITY_QUOTA = 'urn:ietf:params:jmap:quota';

const JMAP_MAIL_CAPABILITIES = [
  JMAP_CAPABILITY_CORE,
  JMAP_CAPABILITY_MAIL,
  JMAP_CAPABILITY_SUBMISSION,
] as const;

export const JMAP_QUOTA_CAPABILITIES = [
  JMAP_CAPABILITY_CORE,
  JMAP_CAPABILITY_QUOTA,
] as const;

const elapsedMs = (startedAt: number): number =>
  Math.round(performance.now() - startedAt);

const TIMEOUT_ERROR_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

const UNAVAILABLE_ERROR_CODES = new Set([
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
  'UND_ERR_DESTROYED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
]);

function toProviderError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  if (error.name === 'TimeoutError') return new MailProviderTimeoutError();

  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') return error;
  if (TIMEOUT_ERROR_CODES.has(code)) return new MailProviderTimeoutError();
  if (UNAVAILABLE_ERROR_CODES.has(code))
    return new MailProviderUnavailableError();
  return error;
}

const withDeadline = (
  deadlineMs: number,
  signal: AbortSignal | undefined,
): AbortSignal => {
  const deadline = AbortSignal.timeout(deadlineMs);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
};

export type StalwartHttpOptions = {
  connectTimeoutMs: number;
  apiTimeoutMs: number;
  blobTimeoutMs: number;
  uploadDeadlineMs: number;
  uploadConnections: number;
  downloadConnections: number;
};

export type JmapRequestOptions = {
  using?: readonly string[];
  session?: JmapSession;
};

@Injectable()
export class JmapService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JmapService.name);
  private readonly stalwartUrl: string;
  private readonly masterUser: string;
  private readonly masterPassword: string;
  private readonly httpOptions: StalwartHttpOptions;
  private apiPool!: Pool;
  private uploadPool!: Pool;
  private downloadPool!: Pool;

  constructor(private readonly configService: ConfigService) {
    this.stalwartUrl = this.configService.getOrThrow<string>('stalwart.url');
    this.masterUser = this.configService.getOrThrow<string>(
      'stalwart.masterUser',
    );
    this.masterPassword = this.configService.getOrThrow<string>(
      'stalwart.masterPassword',
    );
    this.httpOptions =
      this.configService.getOrThrow<StalwartHttpOptions>('stalwart.http');
  }

  onModuleInit() {
    const options = this.httpOptions;
    const connectTimeout = options.connectTimeoutMs;

    this.apiPool = new Pool(this.stalwartUrl, {
      allowH2: true,
      connections: 16,
      keepAliveTimeout: 30_000,
      connectTimeout,
      headersTimeout: options.apiTimeoutMs,
      bodyTimeout: options.apiTimeoutMs,
    });
    const blobPoolOptions = {
      allowH2: false,
      pipelining: 1,
      keepAliveTimeout: 60_000,
      connectTimeout,
      headersTimeout: options.blobTimeoutMs,
      bodyTimeout: options.blobTimeoutMs,
    };
    this.uploadPool = new Pool(this.stalwartUrl, {
      ...blobPoolOptions,
      connections: options.uploadConnections,
    });
    this.downloadPool = new Pool(this.stalwartUrl, {
      ...blobPoolOptions,
      connections: options.downloadConnections,
    });
    this.logger.log(`JMAP client initialized targeting ${this.stalwartUrl}`);
  }

  async onModuleDestroy() {
    await Promise.all([
      this.apiPool.close(),
      this.uploadPool.close(),
      this.downloadPool.close(),
    ]);
  }

  private async withProviderErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw toProviderError(error);
    }
  }

  private requestText(
    pool: Pool,
    options: Dispatcher.RequestOptions,
  ): Promise<{ statusCode: number; text: string }> {
    return this.withProviderErrors(async () => {
      const { statusCode, body } = await pool.request(options);
      return { statusCode, text: await body.text() };
    });
  }

  private toProviderStream(body: Readable): Readable {
    const stream = new PassThrough();
    body.once('error', (error) =>
      stream.destroy(toProviderError(error) as Error),
    );
    stream.once('close', () => body.destroy());
    return body.pipe(stream);
  }

  private buildAuthHeader(userEmail: string): string {
    const credentials = Buffer.from(
      `${userEmail}%${this.masterUser}:${this.masterPassword}`,
    ).toString('base64');
    return `Basic ${credentials}`;
  }

  private requireMailAccountId(session: JmapSession): ID {
    const accountId = session.primaryAccounts?.[JMAP_CAPABILITY_MAIL];

    if (!accountId) {
      throw new JmapError('No primary mail account found', session);
    }

    return accountId;
  }

  async getSession(
    userEmail: string,
    signal?: AbortSignal,
  ): Promise<JmapSession> {
    this.logger.debug(
      `JMAP session request: url=${this.stalwartUrl}/jmap/session user=${userEmail}%${this.masterUser}`,
    );

    const { statusCode, text } = await this.requestText(this.apiPool, {
      method: 'GET',
      path: '/jmap/session',
      headers: {
        authorization: this.buildAuthHeader(userEmail),
        accept: 'application/json',
      },
      signal,
    });

    if (statusCode !== 200) {
      throw new JmapError(
        `Failed to fetch JMAP session: HTTP ${statusCode}`,
        text,
      );
    }

    return JSON.parse(text) as JmapSession;
  }

  async request<T = unknown>(
    userEmail: string,
    methodCalls: JmapMethodCall[],
    { using = JMAP_MAIL_CAPABILITIES, session }: JmapRequestOptions = {},
  ): Promise<JmapResponse<JmapInvocation<T>[]>> {
    const jmapSession = session ?? (await this.getSession(userEmail));

    const requestBody: JmapRequest = {
      using: using as string[],
      methodCalls,
    };

    const apiPath = new URL(jmapSession.apiUrl).pathname;

    const { statusCode, text } = await this.requestText(this.apiPool, {
      method: 'POST',
      path: apiPath,
      headers: {
        authorization: this.buildAuthHeader(userEmail),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (statusCode !== 200) {
      throw new JmapError(`JMAP request failed: HTTP ${statusCode}`, text);
    }

    const response = JSON.parse(text) as JmapResponse<JmapInvocation<T>[]>;

    const errors = response.methodResponses.filter(
      ([name]) => name === 'error',
    );
    if (errors.length > 0) {
      throw new JmapError('JMAP method error', errors);
    }

    return response;
  }

  async getPrimaryAccountId(
    userEmail: string,
    session?: JmapSession,
  ): Promise<ID> {
    return this.requireMailAccountId(
      session ?? (await this.getSession(userEmail)),
    );
  }

  async uploadAttachment({
    userEmail,
    blob,
    signal,
  }: UploadAttachmentPayload): Promise<UploadAttachmentResponse> {
    const { name, buffer, mimeType } = blob;
    const uploadSignal = withDeadline(
      this.httpOptions.uploadDeadlineMs,
      signal,
    );
    const logContext = {
      domain: emailDomain(userEmail),
      size: buffer.length,
      mimeType,
    };

    const sessionStartedAt = performance.now();
    const session = await this.getSession(userEmail, uploadSignal);
    const accountId = this.requireMailAccountId(session);
    this.logger.log(
      { ...logContext, durationMs: elapsedMs(sessionStartedAt) },
      'Attachment upload: JMAP session resolved',
    );

    const fileName = name ?? 'attachment';

    const uploadUrl = session.uploadUrl
      .replace('{accountId}', encodeURIComponent(accountId))
      .replace('{name}', fileName);

    const uploadPath = new URL(uploadUrl).pathname;

    this.logger.log(logContext, 'Attachment upload: sending blob to Stalwart');
    const uploadStartedAt = performance.now();

    const { statusCode, text } = await this.requestText(this.uploadPool, {
      method: 'POST',
      path: uploadPath,
      headers: {
        authorization: this.buildAuthHeader(userEmail),
        'content-type': mimeType,
        'content-length': String(buffer.length),
        accept: 'application/json',
      },
      body: buffer,
      signal: uploadSignal,
    });

    const uploadDurationMs = elapsedMs(uploadStartedAt);

    if (statusCode !== 200 && statusCode !== 201) {
      this.logger.warn(
        { ...logContext, statusCode, durationMs: uploadDurationMs },
        'Attachment upload: Stalwart rejected blob',
      );
      throw new JmapError(
        `Blob upload failed: HTTP ${statusCode}`,
        text,
        statusCode,
      );
    }

    const data = JSON.parse(text) as {
      blobId: string;
      type: string;
      size: number;
    };

    this.logger.log(
      { ...logContext, statusCode, durationMs: uploadDurationMs },
      'Attachment upload: blob stored',
    );

    return {
      blobId: data.blobId,
      size: data.size,
      type: data.type,
    };
  }

  async downloadAttachment({
    userEmail,
    blobId,
    name,
    type,
    signal,
  }: DownloadAttachmentPayload): Promise<DownloadAttachmentResponse> {
    const accountId = this.requireMailAccountId(
      await this.getSession(userEmail, signal),
    );

    const namePart = encodeURIComponent(name ?? 'attachment');
    const acceptQuery = type ? `?accept=${encodeURIComponent(type)}` : '';

    const { statusCode, headers, body } = await this.withProviderErrors(() =>
      this.downloadPool.request({
        method: 'GET',
        path: `/jmap/download/${encodeURIComponent(accountId)}/${encodeURIComponent(blobId)}/${namePart}${acceptQuery}`,
        headers: {
          authorization: this.buildAuthHeader(userEmail),
        },
        signal,
      }),
    );

    if (statusCode !== 200) {
      const text = await this.withProviderErrors(() => body.text());
      throw new JmapError(`Blob download failed: HTTP ${statusCode}`, text);
    }

    const contentType =
      (headers['content-type'] as string | undefined) ??
      'application/octet-stream';
    const contentLengthRaw = headers['content-length'] as string | undefined;
    const contentLength = contentLengthRaw
      ? Number.parseInt(contentLengthRaw, 10)
      : undefined;

    return {
      stream: this.toProviderStream(body),
      contentType,
      contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
    };
  }
}

export class JmapError extends Error {
  constructor(
    message: string,
    public readonly details: unknown,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'JmapError';
  }
}
