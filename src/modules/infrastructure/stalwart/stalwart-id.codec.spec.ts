import { describe, expect, it } from 'vitest';
import { decodeStalwartId, decodeStalwartIdBig } from './stalwart-id.codec.js';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz792013';

function encodeStalwartId(value: bigint): string {
  if (value === 0n) return ALPHABET.charAt(0);
  let v = value;
  let out = '';
  while (v > 0n) {
    out = ALPHABET.charAt(Number(v % 32n)) + out;
    v /= 32n;
  }
  return out;
}

describe('decodeStalwartId', () => {
  it('when given single-character ids, then decodes alphabet positions', () => {
    expect(decodeStalwartId('a')).toBe(0);
    expect(decodeStalwartId('b')).toBe(1);
    expect(decodeStalwartId('z')).toBe(25);
    expect(decodeStalwartId('7')).toBe(26);
    expect(decodeStalwartId('9')).toBe(27);
    expect(decodeStalwartId('2')).toBe(28);
    expect(decodeStalwartId('0')).toBe(29);
    expect(decodeStalwartId('1')).toBe(30);
    expect(decodeStalwartId('3')).toBe(31);
  });

  it('when given multi-character ids, then decodes most significant digit first', () => {
    expect(decodeStalwartId('ba')).toBe(32);
    expect(decodeStalwartId('bb')).toBe(33);
    expect(decodeStalwartId('baa')).toBe(1024);
    expect(decodeStalwartId('d3')).toBe(3 * 32 + 31);
  });

  it('when given an empty string, then throws', () => {
    expect(() => decodeStalwartId('')).toThrow('empty');
  });

  it('when given a character outside the alphabet, then throws', () => {
    expect(() => decodeStalwartId('A')).toThrow("Invalid character 'A'");
    expect(() => decodeStalwartId('b4')).toThrow("Invalid character '4'");
  });

  it('when the value exceeds the safe integer range, then throws', () => {
    // 13 base32 digits ≈ 2^65 — above Number.MAX_SAFE_INTEGER (2^53 - 1)
    expect(() => decodeStalwartId('3333333333333')).toThrow(
      'exceeds safe integer range',
    );
  });
});

describe('decodeStalwartIdBig', () => {
  it('when given small ids, then returns the value as a bigint', () => {
    expect(decodeStalwartIdBig('a')).toBe(0n);
    expect(decodeStalwartIdBig('ba')).toBe(32n);
  });

  it('when the value exceeds the safe integer range, then decodes without throwing', () => {
    const threadId = 5_000_000n;
    const documentId = 13n;
    const emailId = (threadId << 32n) | documentId;
    const encoded = encodeStalwartId(emailId);

    expect(emailId > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(decodeStalwartIdBig(encoded)).toBe(emailId);
    expect(decodeStalwartIdBig(encoded) & 0xffffffffn).toBe(documentId);
    expect(() => decodeStalwartId(encoded)).toThrow(
      'exceeds safe integer range',
    );
  });

  it('when given a character outside the alphabet, then throws', () => {
    expect(() => decodeStalwartIdBig('b4')).toThrow("Invalid character '4'");
  });
});
