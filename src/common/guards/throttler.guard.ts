import { Injectable } from '@nestjs/common';
import { ThrottlerGuard as DefaultThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

@Injectable()
export class ThrottlerGuard extends DefaultThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const { headers, ips, ip } = req as Request;
    const cfConnectingIp = headers['cf-connecting-ip'];
    const clientIp =
      (Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp) ??
      (ips.length ? ips[0] : ip);

    return Promise.resolve(clientIp ?? 'unknown');
  }
}
