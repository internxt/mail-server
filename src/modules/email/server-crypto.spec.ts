import { describe, it, expect, vi, beforeEach } from 'vitest';
import { newEncryptedWrappedKey } from '../../../test/fixtures.js';

vi.mock('internxt-crypto/email-crypto', () => ({
  decryptEmailHybrid: vi.fn(),
}));

vi.mock('internxt-crypto', () => ({
  decryptSymmetrically: vi.fn(),
}));

import { decryptEmailHybrid } from 'internxt-crypto/email-crypto';
import { decryptSymmetrically } from 'internxt-crypto';
import { decryptBody, decryptAttachment } from './server-crypto.js';

describe('server-crypto', () => {
  const mockedDecryptEmailHybrid = vi.mocked(decryptEmailHybrid);
  const mockedDecryptSymmetrically = vi.mocked(decryptSymmetrically);
  const serverPrivateKey = new Uint8Array([1, 2, 3, 4]);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('decryptBody', () => {
    it('When the server key matches, then the decrypted body text is returned', async () => {
      const wrappedKey = newEncryptedWrappedKey();
      mockedDecryptEmailHybrid.mockResolvedValue({ text: 'Hello world' });

      const result = await decryptBody(
        'encrypted-text',
        [wrappedKey],
        serverPrivateKey,
      );

      expect(result).toBe('Hello world');
    });

    it('When the first key does not match but the second does, then it keeps trying until it finds the right one', async () => {
      const wrongKey = newEncryptedWrappedKey();
      const rightKey = newEncryptedWrappedKey();
      mockedDecryptEmailHybrid
        .mockRejectedValueOnce(new Error('integrity check failed'))
        .mockResolvedValueOnce({ text: 'Decrypted body' });

      const result = await decryptBody(
        'encrypted-text',
        [wrongKey, rightKey],
        serverPrivateKey,
      );

      expect(mockedDecryptEmailHybrid).toHaveBeenCalledTimes(2);
      expect(result).toBe('Decrypted body');
    });

    it('When none of the wrapped keys match the server, then an error is thrown', async () => {
      mockedDecryptEmailHybrid.mockRejectedValue(
        new Error('integrity check failed'),
      );

      await expect(
        decryptBody(
          'encrypted-text',
          [newEncryptedWrappedKey(), newEncryptedWrappedKey()],
          serverPrivateKey,
        ),
      ).rejects.toThrow();
    });

    it('When the wrapped keys array is empty, then an error is thrown immediately', async () => {
      await expect(
        decryptBody('encrypted-text', [], serverPrivateKey),
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
