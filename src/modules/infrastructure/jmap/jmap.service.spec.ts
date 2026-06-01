import { describe, it, expect, beforeEach, vi, test } from 'vitest';
import { type ConfigService } from '@nestjs/config';
import { JmapService, JmapError } from './jmap.service.js';

const mockRequest = vi.fn();
vi.mock('undici', () => ({
  Client: vi.fn().mockImplementation(() => ({
    request: mockRequest,
    close: vi.fn(),
  })),
}));

function createConfigService(): ConfigService {
  const config: Record<string, string> = {
    'stalwart.url': 'http://localhost:8080',
    'stalwart.masterUser': 'master',
    'stalwart.masterPassword': 'secret',
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
        blob: { buffer: Buffer.from('binary'), mimeType: 'image/jpeg' },
      });

      expect(result).toEqual({
        accountId: 'acc-1',
        blobId: 'blob-xyz',
        size: 1234,
        type: 'image/jpeg',
      });
    });

    test('when an attachment is uploaded, then the file is sent on behalf of the user with its original bytes and content type', async () => {
      const buffer = Buffer.from('hello world');
      mockRequest.mockResolvedValueOnce(
        httpResponse(200, {
          accountId: 'acc-1',
          blobId: 'blob-1',
          type: 'text/plain',
          size: buffer.length,
        }),
      );

      await service.uploadAttachment({
        userEmail,
        blob: { buffer, mimeType: 'text/plain' },
      });

      // index 0 is the session GET, index 1 is the upload POST
      const uploadCall = mockRequest.mock.calls[1]![0] as {
        method: string;
        path: string;
        headers: Record<string, string>;
        body: Buffer;
      };

      expect(uploadCall.method).toBe('POST');
      expect(uploadCall.path).toBe('/jmap/upload/acc-1/');
      expect(uploadCall.headers['content-type']).toBe('text/plain');
      expect(uploadCall.headers['content-length']).toBe(String(buffer.length));
      expect(uploadCall.headers.authorization).toMatch(/^Basic /);
      expect(uploadCall.body).toBe(buffer);
    });

    test('when an attachment is accepted as newly created, then the upload still completes successfully', async () => {
      mockRequest.mockResolvedValueOnce(
        httpResponse(201, {
          accountId: 'acc-1',
          blobId: 'blob-2',
          type: 'application/pdf',
          size: 42,
        }),
      );

      const result = await service.uploadAttachment({
        userEmail,
        blob: { buffer: Buffer.from('x'), mimeType: 'application/pdf' },
      });

      expect(result.blobId).toBe('blob-2');
    });

    it('when the attachment cannot be stored, then the upload fails with an error', async () => {
      mockRequest.mockResolvedValueOnce(httpResponse(500, 'server boom'));

      await expect(
        service.uploadAttachment({
          userEmail,
          blob: { buffer: Buffer.from('x'), mimeType: 'image/png' },
        }),
      ).rejects.toBeInstanceOf(JmapError);
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
          blob: { buffer: Buffer.from('x'), mimeType: 'image/png' },
        }),
      ).rejects.toBeInstanceOf(JmapError);
    });
  });
});
