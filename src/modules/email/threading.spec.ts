import { describe, test, expect } from 'vitest';
import { ensureRePrefix, generateMessageId } from './threading.js';

const SENDER = 'alice@internxt.me';
const SENDER_DOMAIN = 'internxt.me';
const PARENT_SUBJECT = 'Weekly sync notes';
const REPLY_SUBJECT = 'Re: Weekly sync notes';

describe('Threading helpers', () => {
  describe('Generate Message Id', () => {
    test('When given a sender address, then the Message-ID is built on its domain', () => {
      const messageId = generateMessageId(SENDER);

      expect(messageId).toMatch(new RegExp(`^<.+@${SENDER_DOMAIN}>$`));
    });

    test('When called repeatedly, then each Message-ID is unique', () => {
      const first = generateMessageId(SENDER);
      const second = generateMessageId(SENDER);

      expect(first).not.toBe(second);
    });

    test('When the sender address has an empty domain, then it falls back to localhost', () => {
      const messageId = generateMessageId('broken@');

      expect(messageId).toMatch(/@localhost>$/);
    });
  });

  describe('Ensure the prefix', () => {
    test('When the subject has no prefix, then it is prefixed with "Re:"', () => {
      const result = ensureRePrefix(PARENT_SUBJECT);

      expect(result).toBe(REPLY_SUBJECT);
    });

    test('When the subject already starts with "Re:", then the prefix is not stacked', () => {
      const result = ensureRePrefix(REPLY_SUBJECT);

      expect(result).toBe(REPLY_SUBJECT);
    });

    test('When the existing prefix has odd casing or spacing, then it is normalized', () => {
      const result = ensureRePrefix(`RE :${PARENT_SUBJECT}`);

      expect(result).toBe(REPLY_SUBJECT);
    });

    test('When the subject has surrounding whitespace, then it is trimmed', () => {
      const result = ensureRePrefix(`  ${PARENT_SUBJECT}  `);

      expect(result).toBe(REPLY_SUBJECT);
    });
  });
});
