import { describe, expect, it } from 'vitest';
import { emailDomain, sanitizePath, scrubPii } from './pii';

describe('PII logging helpers', () => {
  describe('emailDomain', () => {
    it('When an address is given, then only its domain is returned', () => {
      expect(emailDomain('John.Doe@Inxt.me')).toBe('inxt.me');
    });

    it('When the value is missing or not an address, then a placeholder is returned', () => {
      expect(emailDomain(undefined)).toBe('unknown');
      expect(emailDomain('')).toBe('unknown');
      expect(emailDomain('not-an-address')).toBe('unknown');
      expect(emailDomain('trailing@')).toBe('unknown');
    });
  });

  describe('scrubPii', () => {
    it('When text embeds addresses, then they are replaced by a placeholder', () => {
      const scrubbed = scrubPii(
        'delivery to jane@inxt.me failed, retry via bob@encrypt.eu',
      );

      expect(scrubbed).toBe('delivery to [email] failed, retry via [email]');
    });

    it('When a serialized payload carries message content, then the content is redacted', () => {
      const scrubbed = scrubPii(
        '{"subject":"Q3 layoffs","preview":"we need to talk","password":"hunter2","id":"a1"}',
      );

      expect(scrubbed).not.toContain('Q3 layoffs');
      expect(scrubbed).not.toContain('we need to talk');
      expect(scrubbed).not.toContain('hunter2');
      expect(scrubbed).toContain('"id":"a1"');
    });

    it('When the value is undefined, then undefined is returned', () => {
      expect(scrubPii(undefined)).toBeUndefined();
    });
  });

  describe('sanitizePath', () => {
    it('When the path holds an address, then it is replaced by a placeholder', () => {
      expect(sanitizePath('/gateway/addresses/jane@inxt.me')).toBe(
        '/gateway/addresses/[email]',
      );
    });

    it('When the url carries a query string, then the query is dropped', () => {
      expect(sanitizePath('/mail/email?search=divorce%20lawyer')).toBe(
        '/mail/email?[redacted]',
      );
    });

    it('When there is no url, then a placeholder is returned', () => {
      expect(sanitizePath(undefined)).toBe('unknown');
    });
  });
});
