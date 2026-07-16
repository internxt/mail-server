import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  newEncryptedWrappedKey,
  newEncryptionBlock,
} from '../../../test/fixtures.js';

vi.mock('internxt-crypto/email-crypto', () => ({
  decryptEmailHybrid: vi.fn(),
}));

vi.mock('internxt-crypto', () => ({
  decryptSymmetrically: vi.fn(),
}));

import { decryptEmailHybrid } from 'internxt-crypto/email-crypto';
import { decryptSymmetrically } from 'internxt-crypto';
import {
  decryptEnvelopeWithServerKey,
  decryptAttachment,
} from './server-crypto.js';

describe('server-crypto', () => {
  const mockedDecryptEmailHybrid = vi.mocked(decryptEmailHybrid);
  const mockedDecryptSymmetrically = vi.mocked(decryptSymmetrically);
  const serverPrivateKey = new Uint8Array([1, 2, 3, 4]);
  const decrypted = {
    text: 'Hello world',
    preview: 'Hello…',
    attachmentsSessionKey: new Uint8Array([9, 8, 7]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('decryptEnvelopeWithServerKey', () => {
    it('When the server key matches, then the decrypted body and attachments key are returned', async () => {
      const envelope = newEncryptionBlock();
      mockedDecryptEmailHybrid.mockResolvedValue(decrypted);

      const result = await decryptEnvelopeWithServerKey(
        envelope,
        serverPrivateKey,
      );

      expect(mockedDecryptEmailHybrid).toHaveBeenCalledWith(
        {
          encText: envelope.encryptedText,
          encPreview: envelope.encryptedPreview,
          encAttachmentsSessionKey: envelope.encryptedAttachmentsSessionKey,
        },
        envelope.wrappedKeys[0],
        serverPrivateKey,
      );
      expect(result).toEqual({
        body: 'Hello world',
        attachmentsSessionKey: decrypted.attachmentsSessionKey,
      });
    });

    it('When the first key does not match but the second does, then it keeps trying until it finds the right one', async () => {
      const envelope = newEncryptionBlock({
        wrappedKeys: [newEncryptedWrappedKey(), newEncryptedWrappedKey()],
      });
      mockedDecryptEmailHybrid
        .mockRejectedValueOnce(new Error('integrity check failed'))
        .mockResolvedValueOnce(decrypted);

      const result = await decryptEnvelopeWithServerKey(
        envelope,
        serverPrivateKey,
      );

      expect(mockedDecryptEmailHybrid).toHaveBeenCalledTimes(2);
      expect(result.body).toBe('Hello world');
    });

    it('When none of the wrapped keys match the server, then an error is thrown', async () => {
      const envelope = newEncryptionBlock({
        wrappedKeys: [newEncryptedWrappedKey(), newEncryptedWrappedKey()],
      });
      mockedDecryptEmailHybrid.mockRejectedValue(
        new Error('integrity check failed'),
      );

      await expect(
        decryptEnvelopeWithServerKey(envelope, serverPrivateKey),
      ).rejects.toThrow();
    });

    it('When the wrapped keys array is empty, then an error is thrown immediately', async () => {
      const envelope = newEncryptionBlock({ wrappedKeys: [] });

      await expect(
        decryptEnvelopeWithServerKey(envelope, serverPrivateKey),
      ).rejects.toThrow();

      expect(mockedDecryptEmailHybrid).not.toHaveBeenCalled();
    });
  });

  describe('decryptAttachment', () => {
    it('When given encrypted bytes and the attachment key, then the decrypted bytes are returned', async () => {
      const ciphertext = new Uint8Array([10, 20, 30]);
      const attachmentKey = new Uint8Array([1, 2, 3]);
      const plaintext = new Uint8Array([99, 98, 97]);
      mockedDecryptSymmetrically.mockResolvedValue(plaintext);

      const result = await decryptAttachment(ciphertext, attachmentKey);

      expect(mockedDecryptSymmetrically).toHaveBeenCalledWith(
        attachmentKey,
        ciphertext,
      );
      expect(result).toBe(plaintext);
    });
  });
});
