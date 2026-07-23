import { describe, test, expect } from 'vitest';
import {
  deriveReplyRecipients,
  ensureRePrefix,
  generateMessageId,
} from './threading.js';
import { newThreadingHeaders } from '../../../test/fixtures.js';

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

  describe('Derive reply recipients', () => {
    const SELF = 'me@example.com';
    const A = { email: 'alice@example.com' };
    const B = { email: 'bob@example.com' };
    const C = { email: 'carol@example.com' };

    test('When replying, then the recipient is the original sender and there is no cc', () => {
      const threading = newThreadingHeaders({
        parentFrom: [A],
        parentReplyTo: [],
        parentTo: [{ email: SELF }],
        parentCc: [],
      });

      const result = deriveReplyRecipients(threading, SELF, false);

      expect(result).toEqual({ to: [A], cc: [] });
    });

    test('When the original has a Reply-To, then it wins over From for the recipient', () => {
      const threading = newThreadingHeaders({
        parentFrom: [A],
        parentReplyTo: [B],
      });

      const result = deriveReplyRecipients(threading, SELF, false);

      expect(result.to).toEqual([B]);
    });

    test('When replying to all, then the other participants are cc’d, excluding self and the recipient', () => {
      const threading = newThreadingHeaders({
        parentFrom: [A],
        parentReplyTo: [],
        parentTo: [{ email: SELF }, B],
        parentCc: [C],
      });

      const result = deriveReplyRecipients(threading, SELF, true);

      expect(result.to).toEqual([A]);
      expect(result.cc).toEqual([B, C]);
    });

    test('When not replying to all, then no participants are cc’d even if the original had many', () => {
      const threading = newThreadingHeaders({
        parentFrom: [A],
        parentTo: [{ email: SELF }, B],
        parentCc: [C],
      });

      const result = deriveReplyRecipients(threading, SELF, false);

      expect(result.cc).toEqual([]);
    });

    test('When the caller adds extra cc, then it is merged with the derived cc', () => {
      const extra = { email: 'extra@example.com' };
      const threading = newThreadingHeaders({
        parentFrom: [A],
        parentTo: [{ email: SELF }, B],
        parentCc: [],
      });

      const result = deriveReplyRecipients(threading, SELF, true, [extra]);

      expect(result.cc).toEqual([B, extra]);
    });

    test('When addresses repeat with different casing, then they are de-duplicated case-insensitively', () => {
      const threading = newThreadingHeaders({
        parentFrom: [A],
        parentTo: [{ email: 'BOB@example.com' }, B],
        parentCc: [B],
      });

      const result = deriveReplyRecipients(threading, SELF, true);

      expect(result.cc).toEqual([{ email: 'BOB@example.com' }]);
    });

    test('When the original was sent by self, then self is never a recipient and to comes back empty', () => {
      const threading = newThreadingHeaders({
        parentFrom: [{ email: SELF }],
        parentReplyTo: [],
      });

      const result = deriveReplyRecipients(threading, SELF, false);

      expect(result.to).toEqual([]);
    });
  });
});
