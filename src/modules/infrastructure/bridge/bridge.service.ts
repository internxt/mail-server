import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'undici';
import type {
  BucketEntry,
  MailBucket,
  UserSpaceSnapshot,
} from './bridge.types.js';

const LOG_TAG = '[bridge-usage]';

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

  async createMailBucket(userUuid: string, name: string): Promise<MailBucket> {
    const token = this.signGatewayToken(userUuid);

    const { statusCode, body } = await this.httpClient.request({
      method: 'POST',
      path: `${this.basePath}/v2/gateway/users/${encodeURIComponent(userUuid)}/buckets`,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
    });

    const text = await body.text();

    if (statusCode !== 200) {
      throw new BridgeApiError(
        `Failed to create mail bucket for user '${userUuid}': HTTP ${statusCode}`,
        statusCode,
        text,
      );
    }

    return JSON.parse(text) as MailBucket;
  }

  async deleteMailBucket(userUuid: string, bucketId: string): Promise<void> {
    const token = this.signGatewayToken(userUuid);

    const { statusCode, body } = await this.httpClient.request({
      method: 'DELETE',
      path: `${this.basePath}/v2/gateway/users/${encodeURIComponent(userUuid)}/buckets/${encodeURIComponent(bucketId)}`,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
    });

    const text = await body.text();

    if (statusCode !== 204) {
      throw new BridgeApiError(
        `Failed to delete mail bucket '${bucketId}' for user '${userUuid}': HTTP ${statusCode}`,
        statusCode,
        text,
      );
    }
  }

  async createBucketEntry(
    userUuid: string,
    bucketId: string,
    size: number,
  ): Promise<BucketEntry> {
    const token = this.signGatewayToken(userUuid);

    const { statusCode, body } = await this.httpClient.request({
      method: 'POST',
      path: `${this.basePath}/v2/gateway/users/${encodeURIComponent(userUuid)}/buckets/${encodeURIComponent(bucketId)}/entries`,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ size }),
    });

    const text = await body.text();

    if (statusCode !== 200) {
      throw new BridgeApiError(
        `Failed to create bucket entry on bucket '${bucketId}' for user '${userUuid}': HTTP ${statusCode}`,
        statusCode,
        text,
      );
    }

    return this.parseSnapshot<BucketEntry>(text, userUuid);
  }

  async deleteBucketEntry(
    userUuid: string,
    bucketId: string,
    entryId: string,
  ): Promise<UserSpaceSnapshot> {
    const token = this.signGatewayToken(userUuid);

    const { statusCode, body } = await this.httpClient.request({
      method: 'DELETE',
      path: `${this.basePath}/v2/gateway/users/${encodeURIComponent(userUuid)}/buckets/${encodeURIComponent(bucketId)}/entries/${encodeURIComponent(entryId)}`,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
    });

    const text = await body.text();

    if (statusCode !== 200) {
      throw new BridgeApiError(
        `Failed to delete bucket entry '${entryId}' on bucket '${bucketId}' for user '${userUuid}': HTTP ${statusCode}`,
        statusCode,
        text,
      );
    }

    return this.parseSnapshot<UserSpaceSnapshot>(text, userUuid);
  }

  async getUserUsage(userUuid: string): Promise<UserSpaceSnapshot> {
    const token = this.signGatewayToken(userUuid);

    const { statusCode, body } = await this.httpClient.request({
      method: 'GET',
      path: `${this.basePath}/v2/gateway/users/${encodeURIComponent(userUuid)}/usage`,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
    });

    const text = await body.text();

    if (statusCode !== 200) {
      throw new BridgeApiError(
        `Failed to fetch usage for user '${userUuid}': HTTP ${statusCode}`,
        statusCode,
        text,
      );
    }

    return this.parseSnapshot<UserSpaceSnapshot>(text, userUuid);
  }

  /**
   * Bridge tracks `totalUsedSpaceBytes` as an incremental counter with no floor,
   * so uploads that were never counted (or counted twice on delete) can drive it
   * negative — production has been observed at -609824950177 for a single user.
   *
   * Guarantees `totalUsedSpaceBytes` is a finite, non-negative number.
   * `maxSpaceBytes` stays as Bridge reported it: there is no safe default for a
   * quota, so callers own that policy (SMTP fails open, provisioning throws).
   */
  private parseSnapshot<T extends UserSpaceSnapshot>(
    text: string,
    userUuid: string,
  ): T {
    const snapshot = JSON.parse(text) as T;
    const { totalUsedSpaceBytes } = snapshot;

    if (!Number.isFinite(totalUsedSpaceBytes) || totalUsedSpaceBytes < 0) {
      this.logger.warn(
        { userUuid, totalUsedSpaceBytes },
        `${LOG_TAG} untrusted totalUsedSpaceBytes; clamping to 0`,
      );

      return { ...snapshot, totalUsedSpaceBytes: 0 };
    }

    return snapshot;
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
