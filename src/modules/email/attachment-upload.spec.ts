import { describe, it, expect } from 'vitest';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { Request } from 'express';
import { Readable } from 'node:stream';
import { receiveFile } from './attachment-upload.js';
import { newMultipartRequest } from '../../../test/fixtures.js';

const field = 'attachments';
const maxBytes = 1024;

describe('Receiving an uploaded file', () => {
  it('when the request carries the file, then its name, type and bytes are exposed as a stream', async () => {
    const req = newMultipartRequest([
      { field, filename: 'photo.jpg', type: 'image/jpeg', content: 'binary' },
    ]);

    const file = await receiveFile(req, { field, maxBytes });

    expect(file.name).toBe('photo.jpg');
    expect(file.mimeType).toBe('image/jpeg');
    expect(Buffer.concat(await file.stream.toArray())).toEqual(
      Buffer.from('binary'),
    );
  });

  it('when other fields and files come first, then they are skipped and the expected file is returned', async () => {
    const req = newMultipartRequest([
      { field: 'note', content: 'hello' },
      { field: 'other', filename: 'x.txt', type: 'text/plain', content: 'x' },
      { field, filename: 'a.txt', type: 'text/plain', content: 'wanted' },
    ]);

    const file = await receiveFile(req, { field, maxBytes });

    expect(file.name).toBe('a.txt');
    expect(Buffer.concat(await file.stream.toArray())).toEqual(
      Buffer.from('wanted'),
    );
  });

  it('when the declared request size exceeds the limit, then it is rejected before the body is read', async () => {
    const body = new Readable({ read: () => undefined });
    const req = Object.assign(body, {
      headers: {
        'content-type': 'multipart/form-data; boundary=b',
        'content-length': String(10 * 1024 * 1024),
      },
    }) as unknown as Request;

    await expect(receiveFile(req, { field, maxBytes })).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
    expect(body.readableFlowing).toBeNull();
  });

  it('when the file grows past the limit without a declared size, then its stream fails as too large', async () => {
    const req = newMultipartRequest(
      [
        {
          field,
          filename: 'big.bin',
          type: 'application/octet-stream',
          content: Buffer.alloc(maxBytes + 1),
        },
      ],
      { declareLength: false },
    );

    const file = await receiveFile(req, { field, maxBytes });

    await expect(file.stream.toArray()).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
  });

  it('when the request has no file under the expected field, then it is rejected as a bad request', async () => {
    const req = newMultipartRequest([{ field: 'note', content: 'hello' }]);

    await expect(receiveFile(req, { field, maxBytes })).rejects.toThrow(
      new BadRequestException('No files uploaded'),
    );
  });

  it('when the request is not multipart, then it is rejected as a bad request', async () => {
    const req = Object.assign(Readable.from(['{}']), {
      headers: { 'content-type': 'application/json' },
    }) as unknown as Request;

    await expect(receiveFile(req, { field, maxBytes })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
