import { describe, it, expect, beforeEach, vi, test } from 'vitest';
import { Readable } from 'node:stream';
import { type ConfigService } from '@nestjs/config';
import { JmapService, JmapError } from './jmap.service.js';

const mockRequest = vi.fn();
vi.mock('undici', () => ({
  Pool: vi.fn().mockImplementation(function () {
    return { request: mockRequest, close: vi.fn() };
  }),
}));

function createConfigService(): ConfigService {
  const config: Record<string, unknown> = {
    'stalwart.url': 'http://localhost:8080',
    'stalwart.masterUser': 'master',
    'stalwart.masterPassword': 'secret',
    'stalwart.http': {
      connectTimeoutMs: 1000,
      apiTimeoutMs: 1000,
      blobTimeoutMs: 1000,
      uploadDeadlineMs: 1000,
      uploadConnections: 1,
      downloadConnections: 1,
    },
  };
  return {
    getOrThrow: vi.fn((key: string) => {
      const value = config[key];
      if (!value) throw new Error(`Missing config: ${key}`);
      return value;
    }),
  } as unknown as ConfigService;
}

function httpResponse(statusCode: number, body: string | object) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { statusCode, body: { text: vi.fn().mockResolvedValue(text) } };
}

const sessionPayload = {
  capabilities: {},
  accounts: {},
  primaryAccounts: {
    'urn:ietf:params:jmap:mail': 'acc-1',
  },
  username: 'user@test.com',
  apiUrl: 'http://localhost:8080/jmap',
  downloadUrl:
    'http://localhost:8080/jmap/download/{accountId}/{blobId}/{name}',
  uploadUrl: 'http://localhost:8080/jmap/upload/{accountId}/',
  eventSourceUrl: 'http://localhost:8080/jmap/eventsource',
  state: 'state-0',
};

describe('JMAP service', () => {
  let service: JmapService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new JmapService(createConfigService());
    service.onModuleInit();
  });

  describe('Uploading attachments', () => {
    const userEmail = 'user@test.com';

    beforeEach(() => {
      mockRequest.mockResolvedValueOnce(httpResponse(200, sessionPayload));
    });

    test('when an attachment is uploaded, then the stored blob details are returned to the caller', async () => {
      mockRequest.mockResolvedValueOnce(
        httpResponse(200, {
          accountId: 'acc-1',
          blobId: 'blob-xyz',
          type: 'image/jpeg',
          size: 1234,
        }),
      );

      const result = await service.uploadAttachment({
        userEmail,
        blob: {
          name: 'image.jpg',
          stream: Readable.from(Buffer.from('binary')),
          mimeType: 'image/jpeg',
        },
      });

      expect(result).toEqual({
        blobId: 'blob-xyz',
        size: 1234,
        type: 'image/jpeg',
      });
    });

    test('when an attachment is uploaded, then the file is streamed on behalf of the user with its content type', async () => {
      const stream = Readable.from(Buffer.from('hello world'));
      mockRequest.mockResolvedValueOnce(
        httpResponse(200, { blobId: 'blob-1', type: 'text/plain', size: 11 }),
      );

      await service.uploadAttachment({
        userEmail,
        blob: { name: 'hello.txt', stream, mimeType: 'text/plain' },
      });

      expect(mockRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/jmap/upload/acc-1/',
          body: stream,
          headers: expect.objectContaining({
            'content-type': 'text/plain',
            authorization: expect.stringMatching(/^Basic /) as string,
          }) as Record<string, string>,
        }),
      );
    });

    test('when an attachment is accepted as newly created, then the upload still completes successfully', async () => {
      mockRequest.mockResolvedValueOnce(
        httpResponse(201, {
          blobId: 'blob-2',
          type: 'application/pdf',
          size: 42,
        }),
      );

      const result = await service.uploadAttachment({
        userEmail,
        blob: {
          name: 'hello.pdf',
          stream: Readable.from(Buffer.from('x')),
          mimeType: 'application/pdf',
        },
      });

      expect(result.blobId).toBe('blob-2');
    });

    it('when the attachment cannot be stored, then the upload fails with an error', async () => {
      mockRequest.mockResolvedValueOnce(httpResponse(500, 'server boom'));

      await expect(
        service.uploadAttachment({
          userEmail,
          blob: {
            name: 'hello.pdf',
            stream: Readable.from(Buffer.from('x')),
            mimeType: 'image/png',
          },
        }),
      ).rejects.toBeInstanceOf(JmapError);
    });

    it('when the attachment is rejected upstream, then the failure carries the upstream status and body', async () => {
      const upstreamBody = {
        type: 'about:blank',
        status: 403,
        title: 'Quota exceeded',
        detail:
          'You have exceeded the blob upload quota of 1000 files or 50000000 bytes.',
      };
      mockRequest.mockResolvedValueOnce(httpResponse(403, upstreamBody));

      await expect(
        service.uploadAttachment({
          userEmail,
          blob: {
            name: 'hello.pdf',
            stream: Readable.from(Buffer.from('x')),
            mimeType: 'image/png',
          },
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        details: JSON.stringify(upstreamBody),
      });
    });

    it('when the user does not have a mail account, then the upload fails with an error', async () => {
      // override the session response queued in beforeEach
      mockRequest.mockReset();
      mockRequest.mockResolvedValueOnce(
        httpResponse(200, {
          ...sessionPayload,
          primaryAccounts: {},
        }),
      );

      await expect(
        service.uploadAttachment({
          userEmail,
          blob: {
            name: 'hello.pdf',
            stream: Readable.from(Buffer.from('x')),
            mimeType: 'image/png',
          },
        }),
      ).rejects.toBeInstanceOf(JmapError);
    });
  });

  describe('Downloading attachments', () => {
    const userEmail = 'user@test.com';
    const signal = new AbortController().signal;

    beforeEach(() => {
      mockRequest.mockResolvedValueOnce(httpResponse(200, sessionPayload));
    });

    function downloadResponse(
      statusCode: number,
      headers: Record<string, string>,
      body: Readable,
    ) {
      return { statusCode, headers, body };
    }

    test('when an attachment is downloaded, then its bytes are returned with the stored content type and size', async () => {
      const fakeStream = Readable.from([Buffer.from('bytes')]);
      mockRequest.mockResolvedValueOnce(
        downloadResponse(
          200,
          { 'content-type': 'image/jpeg', 'content-length': '1234' },
          fakeStream,
        ),
      );

      const result = await service.downloadAttachment({
        userEmail,
        signal,
        blobId: 'blob-1',
      });

      expect(result.contentType).toBe('image/jpeg');
      expect(result.contentLength).toBe(1234);
      await expect(result.stream.toArray()).resolves.toEqual([
        Buffer.from('bytes'),
      ]);
    });

    test('when an attachment is requested with a desired name and type, then those are forwarded to the storage', async () => {
      const fakeStream = Readable.from([Buffer.from('bytes')]);
      mockRequest.mockResolvedValueOnce(
        downloadResponse(200, { 'content-type': 'image/jpeg' }, fakeStream),
      );

      await service.downloadAttachment({
        userEmail,
        signal,
        blobId: 'blob-1',
        name: 'photo.jpg',
        type: 'image/jpeg',
      });

      expect(mockRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/jmap/download/acc-1/blob-1/photo.jpg?accept=image%2Fjpeg',
          headers: expect.objectContaining({
            authorization: expect.stringMatching(/^Basic /) as string,
          }) as Record<string, string>,
        }),
      );
    });

    test('when the response does not include a content type, then a safe default is used', async () => {
      const fakeStream = Readable.from([Buffer.from('bytes')]);
      mockRequest.mockResolvedValueOnce(downloadResponse(200, {}, fakeStream));

      const result = await service.downloadAttachment({
        userEmail,
        signal,
        blobId: 'blob-1',
      });

      expect(result.contentType).toBe('application/octet-stream');
      expect(result.contentLength).toBeUndefined();
    });

    it('when the attachment cannot be retrieved, then the download fails with an error', async () => {
      mockRequest.mockResolvedValueOnce({
        statusCode: 404,
        headers: {},
        body: { text: vi.fn().mockResolvedValue('not found') },
      });

      await expect(
        service.downloadAttachment({
          userEmail,
          signal,
          blobId: 'missing',
        }),
      ).rejects.toBeInstanceOf(JmapError);
    });

    it('when the user does not have a mail account, then the download fails with an error', async () => {
      mockRequest.mockReset();
      mockRequest.mockResolvedValueOnce(
        httpResponse(200, {
          ...sessionPayload,
          primaryAccounts: {},
        }),
      );

      await expect(
        service.downloadAttachment({
          userEmail,
          signal,
          blobId: 'blob-1',
        }),
      ).rejects.toBeInstanceOf(JmapError);
    });
  });
});
