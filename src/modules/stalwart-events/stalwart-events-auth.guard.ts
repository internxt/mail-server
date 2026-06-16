import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class StalwartEventsAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Basic ')) {
      throw new UnauthorizedException();
    }

    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const colonIndex = decoded.indexOf(':');
    if (colonIndex === -1) {
      throw new UnauthorizedException();
    }
    const username = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);

    const expectedUsername =
      this.configService.get<string>('stalwartWebhook.username') ?? '';
    const expectedSecret =
      this.configService.get<string>('stalwartWebhook.secret') ?? '';

    const usernameOk = this.safeCompare(username, expectedUsername);
    const passwordOk = this.safeCompare(password, expectedSecret);

    if (!usernameOk || !passwordOk) {
      throw new UnauthorizedException();
    }

    return true;
  }

  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
