import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import {
  buildContentDisposition,
  sanitizeFilename,
  sanitizeMimeType,
} from './attachment-headers.js';

function makeResponse(): Response {
  return { setHeader: vi.fn() } as unknown as Response;
}

describe('attachment-headers', () => {
  describe('sanitizeFilename', () => {
    it('when given a regular filename, then it is returned untouched', () => {
      expect(sanitizeFilename('photo.jpg')).toBe('photo.jpg');
    });

    it('when no filename is provided, then a generic fallback name is used', () => {
      expect(sanitizeFilename(undefined)).toBe('attachment');
      expect(sanitizeFilename('')).toBe('attachment');
    });

    it('when the filename only contains whitespace, then the generic fallback name is used', () => {
      expect(sanitizeFilename('   ')).toBe('attachment');
    });

    it('when the filename contains line breaks or quotes, then those characters are stripped', () => {
      expect(sanitizeFilename('photo\r\n.jpg')).toBe('photo.jpg');
      expect(sanitizeFilename('a"b\\c.txt')).toBe('abc.txt');
    });

    it('when the filename is very long, then it is shortened to a safe length', () => {
      const longName = 'a'.repeat(500) + '.txt';
      const result = sanitizeFilename(longName);
      expect(result.length).toBe(255);
    });

    it('when the filename has non-ascii characters, then it preserves them', () => {
      expect(sanitizeFilename('fôto-año.pdf')).toBe('fôto-año.pdf');
    });
  });

  describe('sanitizeMimeType', () => {
    it('when given a valid content type, then it is returned untouched', () => {
      expect(sanitizeMimeType('image/jpeg')).toBe('image/jpeg');
      expect(sanitizeMimeType('application/pdf')).toBe('application/pdf');
      expect(sanitizeMimeType('application/vnd.ms-excel')).toBe(
        'application/vnd.ms-excel',
      );
    });

    it('when no content type is provided, then no value is returned', () => {
      expect(sanitizeMimeType(undefined)).toBeNull();
      expect(sanitizeMimeType('')).toBeNull();
    });

    it('when the content type is malformed, then it is rejected', () => {
      expect(sanitizeMimeType('not-a-mime')).toBeNull();
      expect(sanitizeMimeType('image/')).toBeNull();
      expect(sanitizeMimeType('/jpeg')).toBeNull();
      expect(sanitizeMimeType('image jpeg')).toBeNull();
    });

    it('when the content type contains suspicious characters, then it is rejected', () => {
      expect(sanitizeMimeType('image/jpeg\r\nX-Injected: yes')).toBeNull();
      expect(sanitizeMimeType('image/jpeg;charset=utf-8')).toBeNull();
    });
  });

  describe('buildContentDisposition', () => {
    it('when given a simple filename, then it is included both as ascii and utf-8', () => {
      const result = buildContentDisposition('photo.jpg');
      expect(result).toBe(
        `attachment; filename="photo.jpg"; filename*=UTF-8''photo.jpg`,
      );
    });

    it('when the filename has non-ascii characters, then the utf-8 part is percent-encoded', () => {
      const result = buildContentDisposition('año.pdf');
      expect(result).toBe(
        `attachment; filename="año.pdf"; filename*=UTF-8''a%C3%B1o.pdf`,
      );
    });

    it('when the filename has spaces, then the utf-8 part escapes them', () => {
      const result = buildContentDisposition('my photo.jpg');
      expect(result).toBe(
        `attachment; filename="my photo.jpg"; filename*=UTF-8''my%20photo.jpg`,
      );
    });
  });
});
