const MIME_TYPE_REGEX = /^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/;

export function sanitizeFilename(name: string | undefined): string {
  if (!name) return 'attachment';
  const cleaned = name.replace(/[\r\n"\\]/g, '').trim();
  if (!cleaned) return 'attachment';
  return cleaned.slice(0, 255);
}

export function sanitizeMimeType(type: string | undefined): string | null {
  if (!type) return null;
  return MIME_TYPE_REGEX.test(type) ? type : null;
}

export function buildContentDisposition(filename: string): string {
  const safe = sanitizeFilename(filename).normalize('NFC');

  const fallback = safe.normalize('NFKD').replace(/[^\x20-\x7E]/g, '_');

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
