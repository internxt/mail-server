import {
  decryptKeysHybrid,
  decryptEmailHybrid,
} from 'internxt-crypto/email-crypto';
import { decryptSymmetrically } from 'internxt-crypto';
import type { EncryptedWrappedKey } from './email.types.js';

async function trialUnwrapKey(
  wrappedKeys: EncryptedWrappedKey[],
  serverPrivateKey: Uint8Array,
): Promise<Uint8Array> {
  if (!wrappedKeys.length) throw new Error('No wrapped keys provided');
  for (const wrappedKey of wrappedKeys) {
    try {
      return await decryptKeysHybrid(
        {
          hybridCiphertext: wrappedKey.hybridCiphertext,
          encryptedKey: wrappedKey.encryptedKey,
          encryptedForEmail: '',
        },
        serverPrivateKey,
      );
    } catch {
      // not our key, try the next one
    }
  }
  throw new Error(
    'None of the wrapped keys could be decrypted with the server private key',
  );
}

export async function unwrapAttachmentKey(
  wrappedKeys: EncryptedWrappedKey[],
  serverPrivateKey: Uint8Array,
): Promise<Uint8Array> {
  return trialUnwrapKey(wrappedKeys, serverPrivateKey);
}

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
          encryptedKey: {
            hybridCiphertext: wrappedKey.hybridCiphertext,
            encryptedKey: wrappedKey.encryptedKey,
            encryptedForEmail: '',
          },
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
