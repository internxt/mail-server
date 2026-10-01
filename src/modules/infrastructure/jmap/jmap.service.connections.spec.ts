import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { PayloadTooLargeException } from '@nestjs/common';
import { JmapService, type StalwartHttpOptions } from './jmap.service.js';
import {
  MailProviderTimeoutError,
  MailProviderUnavailableError,
} from '../../email/mail-provider.port.js';
import { newJmapSession } from '../../../../test/fixtures.js';

const userEmail = 'user@test.com';
const smallBlob = Buffer.from('attachment-bytes');

type FakeStalwart = {
  server: Server;
  baseUrl: string;
  hangUploads: boolean;
  endlessDownloadClosed: Promise<void>;
};

async function startFakeStalwart(): Promise<FakeStalwart> {
  let markEndlessDownloadClosed!: () => void;
  const fake = {
    hangUploads: false,
    endlessDownloadClosed: new Promise<void>((resolve) => {
      markEndlessDownloadClosed = resolve;
    }),
  } as FakeStalwart;

  fake.server = createServer((req, res) => {
    const url = req.url ?? '';

    if (url === '/jmap/session') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify(
          newJmapSession({
            primaryAccounts: { 'urn:ietf:params:jmap:mail': 'acc-1' },
            apiUrl: `${fake.baseUrl}/jmap`,
            uploadUrl: `${fake.baseUrl}/jmap/upload/{accountId}/`,
          }),
        ),
      );
      return;
    }

    if (url.startsWith('/jmap/download/acc-1/endless/')) {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.on('close', markEndlessDownloadClosed);
      const chunk = Buffer.alloc(64 * 1024);
      const pump = () => {
        while (!res.destroyed && res.write(chunk));
      };
      res.on('drain', pump);
      pump();
      return;
    }

    if (url.startsWith('/jmap/download/acc-1/small/')) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(smallBlob);
      return;
    }

    if (req.method === 'POST' && url.startsWith('/jmap/upload/acc-1/')) {
      let size = 0;
      req.on('data', (chunk: Buffer) => (size += chunk.length));
      req.on('end', () => {
        if (fake.hangUploads) return;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ blobId: 'blob-1', type: 'text/plain', size }));
      });
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  await new Promise<void>((resolve) => fake.server.listen(0, resolve));
  const { port } = fake.server.address() as AddressInfo;
  fake.baseUrl = `http://127.0.0.1:${port}`;
  return fake;
}

function createService(
  url: string,
  http: Partial<StalwartHttpOptions> = {},
): JmapService {
  const service = new JmapService(
    new ConfigService({
      stalwart: {
        url,
        masterUser: 'master',
        masterPassword: 'secret',
        http: {
          connectTimeoutMs: 2000,
          apiTimeoutMs: 2000,
          blobTimeoutMs: 2000,
          uploadDeadlineMs: 2000,
          uploadConnections: 1,
          downloadConnections: 1,
          ...http,
        },
      },
    }),
  );
  service.onModuleInit();
  return service;
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

const uploadSmallBlob = (service: JmapService, signal?: AbortSignal) =>
  service.uploadAttachment({
    userEmail,
    blob: {
      name: 'a.txt',
      stream: Readable.from([smallBlob]),
      mimeType: 'text/plain',
    },
    signal,
  });

describe('JMAP service connections', () => {
  let fake: FakeStalwart;
  let service: JmapService;

  beforeEach(async () => {
    fake = await startFakeStalwart();
    service = createService(fake.baseUrl);
  });

  afterEach(async () => {
    fake.server.closeAllConnections();
    await new Promise((resolve) => fake.server.close(resolve));
    await service.onModuleDestroy();
  });

  it('when a download is left unread, then an upload on the same service still completes', async () => {
    const abandon = new AbortController();
    const stalled = await service.downloadAttachment({
      userEmail,
      blobId: 'endless',
      signal: abandon.signal,
    });
    stalled.stream.on('error', () => undefined);
    stalled.stream.pause();

    await expect(uploadSmallBlob(service)).resolves.toEqual({
      blobId: 'blob-1',
      type: 'text/plain',
      size: smallBlob.length,
    });

    abandon.abort();
  });

  it('when an in-progress download is aborted, then its upstream connection is released and later transfers complete', async () => {
    const abandon = new AbortController();
    const stalled = await service.downloadAttachment({
      userEmail,
      blobId: 'endless',
      signal: abandon.signal,
    });
    stalled.stream.on('error', () => undefined);
    stalled.stream.pause();

    abandon.abort();
    await fake.endlessDownloadClosed;

    const next = await service.downloadAttachment({
      userEmail,
      blobId: 'small',
      signal: new AbortController().signal,
    });
    await expect(readAll(next.stream)).resolves.toEqual(smallBlob);
    await expect(uploadSmallBlob(service)).resolves.toMatchObject({
      blobId: 'blob-1',
    });
  });

  it('when the deadline passes while a download body is being read, then the stream fails with a retryable timeout', async () => {
    const download = await service.downloadAttachment({
      userEmail,
      blobId: 'endless',
      signal: AbortSignal.timeout(200),
    });

    await expect(readAll(download.stream)).rejects.toBeInstanceOf(
      MailProviderTimeoutError,
    );
  });

  it('when the client aborts an upload, then it fails with the abort reason rather than a provider error', async () => {
    fake.hangUploads = true;
    const clientGone = new Error('client went away');
    const abort = new AbortController();

    const upload = uploadSmallBlob(service, abort.signal);
    setTimeout(() => abort.abort(clientGone), 50);

    await expect(upload).rejects.toBe(clientGone);
  });

  it('when the mail server never answers a fully sent upload, then it fails with a retryable timeout once the deadline passes', async () => {
    await service.onModuleDestroy();
    service = createService(fake.baseUrl, { uploadDeadlineMs: 200 });
    fake.hangUploads = true;

    await expect(uploadSmallBlob(service)).rejects.toBeInstanceOf(
      MailProviderTimeoutError,
    );
  });

  it('when the client streams an upload slower than the upstream timeouts, then it still completes', async () => {
    await service.onModuleDestroy();
    service = createService(fake.baseUrl, {
      blobTimeoutMs: 100,
      uploadDeadlineMs: 100,
    });
    const chunks = ['slow', '-', 'client'];
    const slowBody = new Readable({
      read() {
        setTimeout(() => this.push(chunks.shift() ?? null), 80);
      },
    });

    await expect(
      service.uploadAttachment({
        userEmail,
        blob: { name: 'a.txt', stream: slowBody, mimeType: 'text/plain' },
      }),
    ).resolves.toMatchObject({ blobId: 'blob-1', size: 'slow-client'.length });
  });

  it('when the incoming file fails partway through, then the upload fails with that error', async () => {
    const tooLarge = new PayloadTooLargeException();
    const failingBody = new Readable({
      read() {
        this.push('partial');
        this.destroy(tooLarge);
      },
    });

    await expect(
      service.uploadAttachment({
        userEmail,
        blob: { name: 'a.txt', stream: failingBody, mimeType: 'text/plain' },
      }),
    ).rejects.toBe(tooLarge);
  });

  it('when the mail server cannot be reached, then the call fails as temporarily unavailable', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, resolve));
    const { port } = closed.address() as AddressInfo;
    await new Promise((resolve) => closed.close(resolve));

    const unreachable = createService(`http://127.0.0.1:${port}`);

    await expect(unreachable.getSession(userEmail)).rejects.toBeInstanceOf(
      MailProviderUnavailableError,
    );
    await unreachable.onModuleDestroy();
  });
});
