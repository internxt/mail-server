import type { EncryptedSummaryFields, EncryptionBlock } from './email.types.js';

export const ENCRYPTED_PREFIX = 'INTERNXT-ENCRYPTED-EMAIL-v1';

/**
 * Packs an encryption envelope into a text body blob:
 *   "INTERNXT-ENCRYPTED-EMAIL-v1\n" + base64(JSON.stringify(envelope))
 */
export function packEnvelope(envelope: EncryptionBlock): string {
  const bundle = Buffer.from(JSON.stringify(envelope)).toString('base64');
  return `${ENCRYPTED_PREFIX}\n${bundle}`;
}

/**
 * Cheap detector usable on the summary preview alone — no body fetch required.
 * A provider's preview is derived from the body, which begins with the marker.
 */
export function isEncryptedBody(text: string): boolean {
  return text.startsWith(ENCRYPTED_PREFIX);
}

export function parseEnvelope(textBody: string): EncryptionBlock | null {
  if (!isEncryptedBody(textBody)) return null;

  const bundle = textBody.slice(ENCRYPTED_PREFIX.length).trimStart();
  try {
    return JSON.parse(
      Buffer.from(bundle, 'base64').toString('utf8'),
    ) as EncryptionBlock;
  } catch {
    return null;
  }
}

/**
 * Projects the summary-safe fields for a single caller: the shared encrypted
 * subject/preview plus only that caller's wrapped key. Never exposes the full
 * per-recipient key map. Returns null when the caller has no key (cannot decrypt).
 */
export function projectForCaller(
  envelope: EncryptionBlock,
  callerEmail: string,
): EncryptedSummaryFields | null {
  const wrappedKey = envelope.wrappedKeys[callerEmail.toLowerCase()];
  if (!wrappedKey) return null;

  return {
    encryptedSubject: envelope.encryptedSubject,
    encryptedPreview: envelope.encryptedPreview,
    wrappedKey,
  };
}
