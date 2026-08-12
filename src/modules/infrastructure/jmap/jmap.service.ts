import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'undici';
import type { Readable } from 'node:stream';
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
  private httpClient!: Client;
  private blobClient!: Client;

  constructor(private readonly configService: ConfigService) {
    this.stalwartUrl = this.configService.getOrThrow<string>('stalwart.url');
    this.masterUser = this.configService.getOrThrow<string>(
      'stalwart.masterUser',
    );
    this.masterPassword = this.configService.getOrThrow<string>(
      'stalwart.masterPassword',
    );
  }

  onModuleInit() {
    this.httpClient = new Client(this.stalwartUrl, {
      allowH2: true,
      keepAliveTimeout: 30_000,
      pipelining: 1,
    });
    this.blobClient = new Client(this.stalwartUrl, {
      allowH2: false,
      keepAliveTimeout: 60_000,
      pipelining: 1,
      bodyTimeout: 60_000,
      headersTimeout: 60_000,
    });
    this.logger.log(`JMAP client initialized targeting ${this.stalwartUrl}`);
  }

  async onModuleDestroy() {
    await Promise.all([this.httpClient.close(), this.blobClient.close()]);
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

  async getSession(userEmail: string): Promise<JmapSession> {
    this.logger.debug(
      `JMAP session request: url=${this.stalwartUrl}/jmap/session user=${userEmail}%${this.masterUser}`,
    );

    const { statusCode, body } = await this.httpClient.request({
      method: 'GET',
      path: '/jmap/session',
      headers: {
        authorization: this.buildAuthHeader(userEmail),
        accept: 'application/json',
      },
    });

    const text = await body.text();

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

    const { statusCode, body } = await this.httpClient.request({
      method: 'POST',
      path: apiPath,
      headers: {
        authorization: this.buildAuthHeader(userEmail),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const text = await body.text();

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
  }: UploadAttachmentPayload): Promise<UploadAttachmentResponse> {
    const session = await this.getSession(userEmail);
    const accountId = this.requireMailAccountId(session);
    const { name, buffer, mimeType } = blob;
    const fileName = name ?? 'attachment';

    const uploadUrl = session.uploadUrl
      .replace('{accountId}', encodeURIComponent(accountId))
      .replace('{name}', fileName);

    const uploadPath = new URL(uploadUrl).pathname;

    const { statusCode, body } = await this.blobClient.request({
      method: 'POST',
      path: uploadPath,
      headers: {
        authorization: this.buildAuthHeader(userEmail),
        'content-type': mimeType,
        'content-length': String(buffer.length),
        accept: 'application/json',
      },
      body: buffer,
    });

    const text = await body.text();

    if (statusCode !== 200 && statusCode !== 201) {
      throw new JmapError(`Blob upload failed: HTTP ${statusCode}`, text);
    }

    const data = JSON.parse(text) as {
      blobId: string;
      type: string;
      size: number;
    };

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
  }: DownloadAttachmentPayload): Promise<DownloadAttachmentResponse> {
    const accountId = await this.getPrimaryAccountId(userEmail);

    const namePart = encodeURIComponent(name ?? 'attachment');
    const acceptQuery = type ? `?accept=${encodeURIComponent(type)}` : '';

    const { statusCode, headers, body } = await this.blobClient.request({
      method: 'GET',
      path: `/jmap/download/${encodeURIComponent(accountId)}/${encodeURIComponent(blobId)}/${namePart}${acceptQuery}`,
      headers: {
        authorization: this.buildAuthHeader(userEmail),
      },
    });

    if (statusCode !== 200) {
      const text = await body.text();
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
      stream: body as unknown as Readable,
      contentType,
      contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
    };
  }
}

export class JmapError extends Error {
  constructor(
    message: string,
    public readonly details: unknown,
  ) {
    super(message);
    this.name = 'JmapError';
  }
}
