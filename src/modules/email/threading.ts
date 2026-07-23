import { randomUUID } from 'node:crypto';
import type { EmailAddress, ThreadingHeaders } from './email.types.js';

const RE_PREFIX = /^\s*re\s*:\s*/i;

/**
 * Builds an RFC 5322 §3.6.4-compliant Message-ID: `<uuid@domain>`, globally
 * unique with the sender's domain on the right. The left-hand side format is
 * unconstrained by the spec; a UUID guarantees uniqueness without shared state.
 */
export function generateMessageId(senderEmail: string): string {
  const domain = senderEmail.split('@').pop() || 'localhost';
  return `<${randomUUID()}@${domain}>`;
}

export function ensureRePrefix(parentSubject: string): string {
  const base = parentSubject.trim();
  if (RE_PREFIX.test(base)) {
    return base.replace(RE_PREFIX, 'Re: ');
  }
  return `Re: ${base}`;
}

export interface ReplyRecipients {
  to: EmailAddress[];
  cc: EmailAddress[];
}

export function deriveReplyRecipients(
  threading: ThreadingHeaders,
  self: string,
  replyAll: boolean,
  extraCc: EmailAddress[] = [],
): ReplyRecipients {
  const to = uniqueAddresses(
    threading.parentReplyTo.length
      ? threading.parentReplyTo
      : threading.parentFrom,
    [self],
  );

  const excludeFromCc = [self, ...to.map((a) => a.email)];

  const replyAllCc = replyAll
    ? [...threading.parentTo, ...threading.parentCc]
    : [];

  const cc = uniqueAddresses([...replyAllCc, ...extraCc], excludeFromCc);

  return { to, cc };
}

function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

function uniqueAddresses(
  addresses: EmailAddress[],
  exclude: string[] = [],
): EmailAddress[] {
  const excludedKeys = exclude.map(emailKey);
  const seen = new Set(excludedKeys);
  const result: EmailAddress[] = [];
  for (const addr of addresses) {
    const key = emailKey(addr.email);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(addr);
  }
  return result;
}
