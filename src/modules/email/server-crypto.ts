import { decryptEmailHybrid } from 'internxt-crypto/email-crypto';
import { decryptSymmetrically } from 'internxt-crypto';
import type { EncryptionBlock } from './email.types.js';

export interface DecryptedEnvelope {
  body: string;
  attachmentsSessionKey: Uint8Array;
}

export async function decryptEnvelopeWithServerKey(
  envelope: EncryptionBlock,
  serverPrivateKey: Uint8Array,
): Promise<DecryptedEnvelope> {
  if (!envelope.wrappedKeys.length)
    throw new Error('No wrapped keys provided for body');
  for (const wrappedKey of envelope.wrappedKeys) {
    try {
      const { text, attachmentsSessionKey } = await decryptEmailHybrid(
        {
          encText: envelope.encryptedText,
          encPreview: envelope.encryptedPreview,
          encAttachmentsSessionKey: envelope.encryptedAttachmentsSessionKey,
        },
        wrappedKey,
        serverPrivateKey,
      );
      return { body: text, attachmentsSessionKey };
    } catch {
      // not our key, try the next one
    }
  }
  throw new Error(
    'None of the wrapped keys could be used to decrypt the envelope with the server private key',
  );
}

export async function decryptAttachment(
  ciphertext: Uint8Array,
  attachmentKey: Uint8Array,
): Promise<Uint8Array> {
  return decryptSymmetrically(attachmentKey, ciphertext);
}
