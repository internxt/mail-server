import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import busboy from 'busboy';
import type { Request } from 'express';
import { PassThrough, type Readable } from 'node:stream';

// Room for the multipart boundaries and part headers around the file.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export interface IncomingFile {
  name: string;
  mimeType: string;
  stream: Readable;
}

const tooLarge = (maxBytes: number) =>
  new PayloadTooLargeException(
    `Attachment exceeds the ${maxBytes / (1024 * 1024)}MB limit`,
  );

/**
 * Resolves as soon as the multipart part named `field` starts arriving, with
 * its bytes exposed as a stream, so the file can be forwarded without being
 * buffered. Requests whose declared length already exceeds the limit are
 * rejected before any of the body is read.
 */
export function receiveFile(
  req: Request,
  { field, maxBytes }: { field: string; maxBytes: number },
): Promise<IncomingFile> {
  const declaredLength = Number(req.headers['content-length']);
  if (declaredLength > maxBytes + MULTIPART_OVERHEAD_BYTES) {
    return Promise.reject(tooLarge(maxBytes));
  }

  return new Promise((resolve, reject) => {
    let parser: busboy.Busboy;
    try {
      parser = busboy({ headers: req.headers, limits: { fileSize: maxBytes } });
    } catch {
      reject(new BadRequestException('Expected a multipart/form-data upload'));
      return;
    }

    let received: PassThrough | undefined;

    parser.on('file', (fieldName, file, info) => {
      if (fieldName !== field || received) {
        file.resume();
        return;
      }

      const stream = new PassThrough();
      received = stream;
      stream.on('error', () => undefined);
      file.once('limit', () => {
        file.unpipe(stream);
        stream.destroy(tooLarge(maxBytes));
      });
      file.once('error', (error) => stream.destroy(error));
      stream.once('close', () => file.resume());

      resolve({
        name: info.filename,
        mimeType: info.mimeType,
        stream: file.pipe(stream),
      });
    });

    parser.once('error', (error: Error) => {
      if (received) received.destroy(error);
      else reject(new BadRequestException('Malformed multipart upload'));
    });
    parser.once('close', () => {
      if (!received) reject(new BadRequestException('No files uploaded'));
    });

    req.pipe(parser);
  });
}
