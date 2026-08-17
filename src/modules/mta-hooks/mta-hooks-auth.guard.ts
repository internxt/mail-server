import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class MtaHooksAuthGuard implements CanActivate {
  private readonly logger = new Logger(MtaHooksAuthGuard.name);
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
      this.logger.warn(
        `[mta-hook-auth] rejected ${request.method} ${request.url}: ` +
          `expected a Basic authorization header, got scheme='${scheme || 'none'}'`,
      );
      throw new UnauthorizedException('Missing or malformed Basic credentials');
    }

    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      this.logger.warn(
        `[mta-hook-auth] rejected ${request.method} ${request.url}: ` +
          'Basic credentials carry no ":" separator',
      );
      throw new UnauthorizedException('Malformed Basic credentials');
    }

    const username = decoded.slice(0, separatorIndex);
    const secret = decoded.slice(separatorIndex + 1);

    const usernameMatches = this.safeEqual(username, this.expectedUsername);
    const secretMatches = this.safeEqual(secret, this.expectedSecret);
    if (!usernameMatches || !secretMatches) {
      this.logger.warn(
        `[mta-hook-auth] rejected ${request.method} ${request.url}: ` +
          `usernameMatches=${usernameMatches} secretMatches=${secretMatches} ` +
          `receivedUsername='${username}'`,
      );
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
