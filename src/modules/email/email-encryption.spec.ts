import { describe, it, expect } from 'vitest';
import {
  ENCRYPTED_PREFIX,
  isEncryptedBody,
  packEnvelope,
  parseEnvelope,
  projectForCaller,
} from './email-encryption.js';
import {
  newEncryptionBlock,
  newEncryptedWrappedKey,
} from '../../../test/fixtures.js';

describe('email-encryption', () => {
  describe('packEnvelope / parseEnvelope', () => {
    it('when packed, then parseEnvelope round-trips the envelope', () => {
      const envelope = newEncryptionBlock();

      const packed = packEnvelope(envelope);

      expect(packed.startsWith(`${ENCRYPTED_PREFIX}\n`)).toBe(true);
      expect(parseEnvelope(packed)).toEqual(envelope);
    });

    it('when body is not encrypted, then parseEnvelope returns null', () => {
      expect(parseEnvelope('just a regular plaintext body')).toBeNull();
    });

    it('when body has the marker but garbage payload, then returns null', () => {
      expect(
        parseEnvelope(`${ENCRYPTED_PREFIX}\nnot-valid-base64-json`),
      ).toBeNull();
    });
  });

  describe('isEncryptedBody', () => {
    it('when text starts with the marker, then returns true', () => {
      expect(isEncryptedBody(`${ENCRYPTED_PREFIX}\nAAAA`)).toBe(true);
    });

    it('when text does not start with the marker, then returns false', () => {
      expect(isEncryptedBody('Hi team, here are the notes')).toBe(false);
    });
  });

  describe('projectForCaller', () => {
    it('when given an envelope, then projects the preview and full wrapped-key array', () => {
      const wrappedKeys = [newEncryptedWrappedKey(), newEncryptedWrappedKey()];
      const envelope = newEncryptionBlock({ wrappedKeys });

      const result = projectForCaller(envelope);

      expect(result).toEqual({
        encryptedPreview: envelope.encryptedPreview,
        wrappedKeys,
      });
    });
  });
});
