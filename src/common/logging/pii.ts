const EMAIL_PATTERN = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}/g;
const SENSITIVE_KEYS = [
  'subject',
  'preview',
  'body',
  'bodyValues',
  'textBody',
  'htmlBody',
  'text',
  'html',
  'value',
  'password',
  'publicKey',
  'privateKey',
  'encryptionPrivateKey',
  'recoveryPrivateKey',
  'mnemonic',
  'token',
  'secret',
  'authorization',
];

const SENSITIVE_KEY_PATTERN = new RegExp(
  String.raw`("(?:${SENSITIVE_KEYS.join('|')})"\s*:\s*)(".*?(?<!\\)"|\[[^\]]*\]|\{[^}]*\}|[^,}\]]+)`,
  'gi',
);

export const REDACTED = '[redacted]';
export const EMAIL_PLACEHOLDER = '[email]';

export function emailDomain(email?: string | null): string {
  const at = email?.lastIndexOf('@') ?? -1;
  if (!email || at < 0 || at === email.length - 1) return 'unknown';

  return email.slice(at + 1).toLowerCase();
}

export function scrubPii(value: string): string;
export function scrubPii(value: undefined): undefined;
export function scrubPii(value?: string): string | undefined;
export function scrubPii(value?: string): string | undefined {
  if (value === undefined) return undefined;

  return value
    .replace(SENSITIVE_KEY_PATTERN, `$1"${REDACTED}"`)
    .replace(EMAIL_PATTERN, EMAIL_PLACEHOLDER);
}

export function sanitizePath(url?: string): string {
  if (!url) return 'unknown';

  const [path = '', query] = url.split('?');

  return query
    ? `${path.replace(EMAIL_PATTERN, EMAIL_PLACEHOLDER)}?${REDACTED}`
    : path.replace(EMAIL_PATTERN, EMAIL_PLACEHOLDER);
}
