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
    it('when caller has a wrapped key, then projects subject, preview and only that key', () => {
      const callerKey = newEncryptedWrappedKey();
      const envelope = newEncryptionBlock({
        wrappedKeys: {
          'caller@internxt.me': callerKey,
          'other@internxt.me': newEncryptedWrappedKey(),
        },
      });

      const result = projectForCaller(envelope, 'caller@internxt.me');

      expect(result).toEqual({
        encryptedSubject: envelope.encryptedSubject,
        encryptedPreview: envelope.encryptedPreview,
        wrappedKey: callerKey,
      });
    });

    it('when caller address differs in case, then matches case-insensitively', () => {
      const callerKey = newEncryptedWrappedKey();
      const envelope = newEncryptionBlock({
        wrappedKeys: { 'caller@internxt.me': callerKey },
      });

      const result = projectForCaller(envelope, 'Caller@Internxt.ME');

      expect(result?.wrappedKey).toEqual(callerKey);
    });

    it('when caller has no wrapped key, then returns null', () => {
      const envelope = newEncryptionBlock({
        wrappedKeys: { 'someone@internxt.me': newEncryptedWrappedKey() },
      });

      expect(projectForCaller(envelope, 'caller@internxt.me')).toBeNull();
    });
  });
});
