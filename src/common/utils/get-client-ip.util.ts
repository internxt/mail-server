import type { IncomingHttpHeaders } from 'node:http';

export interface ClientIpRequest {
  headers: IncomingHttpHeaders;
  ip?: string;
  socket?: { remoteAddress?: string };
}

const CF_CONNECTING_IP = 'cf-connecting-ip';
const X_REAL_IP = 'x-real-ip';
const X_FORWARDED_FOR = 'x-forwarded-for';

const firstHeaderValue = (
  value: string | string[] | undefined,
): string | undefined => {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed || undefined;
};

const leftmostForwardedFor = (
  value: string | string[] | undefined,
): string | undefined => {
  const raw = firstHeaderValue(value);
  const client = raw?.split(',')[0]?.trim();
  return client || undefined;
};

export const getClientIp = (req: ClientIpRequest): string => {
  const headers = req.headers ?? {};

  return (
    firstHeaderValue(headers[CF_CONNECTING_IP]) ??
    firstHeaderValue(headers[X_REAL_IP]) ??
    leftmostForwardedFor(headers[X_FORWARDED_FOR]) ??
    req.ip ??
    req.socket?.remoteAddress ??
    'unknown'
  );
};
