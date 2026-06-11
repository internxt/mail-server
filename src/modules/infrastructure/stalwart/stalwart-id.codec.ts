// Must match Stalwart's BASE32_ALPHABET (crates/utils/src/codec/base32_custom.rs):
// every JMAP id Stalwart returns (accounts, domains, emails) is this custom
// base32 encoding of an unsigned integer, most significant digit first.
const STALWART_BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz792013';

const CHAR_VALUES = new Map<string, bigint>(
  [...STALWART_BASE32_ALPHABET].map((char, index) => [char, BigInt(index)]),
);

export function decodeStalwartId(id: string): number {
  if (id.length === 0) {
    throw new Error('Cannot decode empty Stalwart id');
  }

  let value = 0n;
  for (const char of id) {
    const digit = CHAR_VALUES.get(char);
    if (digit === undefined) {
      throw new Error(`Invalid character '${char}' in Stalwart id '${id}'`);
    }
    value = value * 32n + digit;
  }

  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Stalwart id '${id}' exceeds safe integer range`);
  }

  return Number(value);
}
