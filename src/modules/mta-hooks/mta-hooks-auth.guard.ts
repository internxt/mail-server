import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class MtaHooksAuthGuard implements CanActivate {
  private readonly expectedUsername: string;
  private readonly expectedSecret: string;

  constructor(configService: ConfigService) {
    this.expectedUsername = this.requireNonEmpty(
      configService.getOrThrow<string>('mtaHooks.username'),
      'mtaHooks.username',
    );
    this.expectedSecret = this.requireNonEmpty(
      configService.getOrThrow<string>('mtaHooks.secret'),
      'mtaHooks.secret',
    );
  }

  private requireNonEmpty(value: string, key: string): string {
    if (value.length === 0) {
      throw new Error(`Missing required configuration: ${key}`);
    }
    return value;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';

    const [scheme, encoded] = header.split(' ');
    if (scheme !== 'Basic' || !encoded) {
      throw new UnauthorizedException('Missing or malformed Basic credentials');
    }

    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      throw new UnauthorizedException('Malformed Basic credentials');
    }

    const username = decoded.slice(0, separatorIndex);
    const secret = decoded.slice(separatorIndex + 1);

    const usernameMatches = this.safeEqual(username, this.expectedUsername);
    const secretMatches = this.safeEqual(secret, this.expectedSecret);
    if (!usernameMatches || !secretMatches) {
      throw new UnauthorizedException('Invalid MTA hook credentials');
    }

    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    const bufferA = Buffer.from(a, 'utf8');
    const bufferB = Buffer.from(b, 'utf8');
    if (bufferA.length !== bufferB.length) {
      return false;
    }
    return timingSafeEqual(bufferA, bufferB);
  }
}
