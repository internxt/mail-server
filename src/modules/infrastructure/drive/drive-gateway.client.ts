import {
  Injectable,
  Logger,
  UnauthorizedException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'undici';

@Injectable()
export class DriveGatewayClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DriveGatewayClient.name);
  private readonly baseUrl: string;
  private readonly gatewayPrivateKey: string;
  private httpClient!: Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>('apis.drive.url');
    const base64Secret = this.configService.getOrThrow<string>(
      'secrets.gatewayPrivate',
    );
    this.gatewayPrivateKey = Buffer.from(base64Secret, 'base64').toString(
      'utf8',
    );
  }

  onModuleInit() {
    this.httpClient = new Client(this.baseUrl, {
      allowH2: true,
      keepAliveTimeout: 30_000,
      pipelining: 1,
    });
    this.logger.log(
      `Drive gateway client initialized targeting ${this.baseUrl}`,
    );
  }

  async onModuleDestroy() {
    await this.httpClient.close();
  }

  async verifyPassword(
    userUuid: string,
    encryptedPassword: string,
  ): Promise<void> {
    const jwt = this.signToken();

    const { statusCode, body } = await this.httpClient.request({
      method: 'POST',
      path: `/gateway/users/${encodeURIComponent(userUuid)}/verify-password`,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ encryptedPassword }),
    });

    const text = await body.text();

    if (statusCode === 200 || statusCode === 204) return;
    if (statusCode === 401) {
      throw new UnauthorizedException('Invalid credentials');
    }

    throw new DriveGatewayError(
      `Drive verify-password failed for '${userUuid}': HTTP ${statusCode}`,
      statusCode,
      text,
    );
  }

  private signToken(): string {
    return this.jwtService.sign(
      {},
      {
        secret: this.gatewayPrivateKey,
        algorithm: 'RS256',
        expiresIn: '5m',
      },
    );
  }
}

export class DriveGatewayError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details: string,
  ) {
    super(message);
    this.name = 'DriveGatewayError';
  }
}
