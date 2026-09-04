import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'undici';
import type { Tier } from './payments.types.js';

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly baseUrl: string;
  private readonly origin: string;
  private readonly basePath: string;
  private readonly jwtSecret: string;
  private readonly internxtClient: string;
  private httpClient!: Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>('apis.payments.url');
    this.jwtSecret = this.configService.getOrThrow<string>('secrets.jwt');
    this.internxtClient = this.configService.getOrThrow<string>(
      'apis.internxtClient',
    );
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
    this.logger.log(`Payments client initialized targeting ${this.baseUrl}`);
  }

  async onModuleDestroy() {
    await this.httpClient.close();
  }

  async getUserTier(userUuid: string): Promise<Tier> {
    const jwt = this.jwtService.sign(
      { payload: { uuid: userUuid, workspaces: { owners: [userUuid] } } },
      { secret: this.jwtSecret },
    );

    const { statusCode, body } = await this.httpClient.request({
      method: 'GET',
      path: `${this.basePath}/products/tier`,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${jwt}`,
        ...this.clientHeader(),
      },
    });

    const text = await body.text();

    if (statusCode !== 200) {
      throw new PaymentsApiError(
        `Failed to fetch tier for user '${userUuid}': HTTP ${statusCode}`,
        statusCode,
        text,
      );
    }

    return JSON.parse(text) as Tier;
  }

  private clientHeader(): Record<string, string> {
    return { 'internxt-client': this.internxtClient };
  }
}

export class PaymentsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details: string,
  ) {
    super(message);
    this.name = 'PaymentsApiError';
  }
}
