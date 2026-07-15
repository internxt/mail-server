import { decryptEmailHybrid } from 'internxt-crypto/email-crypto';
import { decryptSymmetrically } from 'internxt-crypto';
import type { EncryptedWrappedKey } from './email.types.js';

export async function decryptBody(
  encryptedText: string,
  wrappedKeys: EncryptedWrappedKey[],
  serverPrivateKey: Uint8Array,
): Promise<string> {
  if (!wrappedKeys.length) throw new Error('No wrapped keys provided for body');
  for (const wrappedKey of wrappedKeys) {
    try {
      const { text } = await decryptEmailHybrid(
        {
          encryptedKey: wrappedKey,
          encEmail: { encText: encryptedText },
        },
        serverPrivateKey,
      );
      return text;
    } catch {
      // not our key, try the next one
    }
  }
  throw new Error(
    'None of the wrapped keys could be used to decrypt the body with the server private key',
  );
}

export async function decryptAttachment(
  ciphertext: Uint8Array,
  attachmentKey: Uint8Array,
): Promise<Uint8Array> {
  return decryptSymmetrically(attachmentKey, ciphertext);
}
