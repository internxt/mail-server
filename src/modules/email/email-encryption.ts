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
 * Projects the summary-safe fields from an envelope: the encrypted preview plus
 * the de-identified wrapped-key array. The client trial-decrypts the keys to
 * determine readability — the backend holds no keys and cannot filter per caller.
 */
export function projectForCaller(
  envelope: EncryptionBlock,
): EncryptedSummaryFields {
  return {
    encryptedPreview: envelope.encryptedPreview,
    wrappedKeys: envelope.wrappedKeys,
  };
}
