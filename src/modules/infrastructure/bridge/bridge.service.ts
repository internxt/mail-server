import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'undici';
import type { UserStorage } from './bridge.types.js';

@Injectable()
export class BridgeClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BridgeClient.name);
  private readonly baseUrl: string;
  private readonly origin: string;
  private readonly basePath: string;
  private readonly signingKey: string;
  private readonly isProduction: boolean;
  private httpClient!: Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>('apis.bridge.url');
    this.signingKey = Buffer.from(
      this.configService.getOrThrow<string>('secrets.bridgePrivateGateway'),
      'base64',
    ).toString('utf8');
    this.isProduction = this.configService.getOrThrow<boolean>('isProduction');
    const parsed = new URL(this.baseUrl);
    this.origin = parsed.origin;
    this.basePath =
      parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
  }

  onModuleInit() {
    this.httpClient = new Client(this.origin, {
      allowH2: true,
      keepAliveTimeout: 30_000,
      pipelining: 1,
    });
    this.logger.log(`Bridge client initialized targeting ${this.baseUrl}`);
  }

  async onModuleDestroy() {
    await this.httpClient.close();
  }

  async reportMailUsage(
    userUuid: string,
    mailUsedBytes: number,
  ): Promise<UserStorage> {
    const token = this.signGatewayToken(userUuid);

    const { statusCode, body } = await this.httpClient.request({
      method: 'PUT',
      path: `${this.basePath}/v2/gateway/users/${encodeURIComponent(userUuid)}/mail-usage`,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ mailUsedBytes }),
    });

    const text = await body.text();

    if (statusCode !== 200) {
      throw new BridgeApiError(
        `Failed to report mail usage for user '${userUuid}': HTTP ${statusCode}`,
        statusCode,
        text,
      );
    }

    return JSON.parse(text) as UserStorage;
  }

  private signGatewayToken(userUuid: string): string {
    return this.jwtService.sign(
      { payload: { uuid: userUuid } },
      {
        secret: this.signingKey,
        algorithm: 'RS256',
        expiresIn: '1m',
        ...(this.isProduction ? null : { allowInsecureKeySizes: true }),
      },
    );
  }
}

export class BridgeApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details: string,
  ) {
    super(message);
    this.name = 'BridgeApiError';
  }
}
