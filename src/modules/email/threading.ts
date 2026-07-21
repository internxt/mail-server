import { randomUUID } from 'node:crypto';

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
