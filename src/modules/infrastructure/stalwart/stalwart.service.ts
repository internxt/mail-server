import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'undici';

interface StalwartPrincipal {
  name: string;
  type: string;
  description?: string;
  secrets?: string[];
  emails?: string[];
  quota?: number;
  memberOf?: string[];
  roles?: string[];
  lists?: string[];
  enabledPermissions?: string[];
  disabledPermissions?: string[];
}

type PatchAction = 'set' | 'addItem' | 'removeItem';

interface PatchOperation {
  action: PatchAction;
  field: string;
  value: unknown;
}

@Injectable()
export class StalwartService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StalwartService.name);
  private readonly adminUrl: string;
  private readonly adminToken: string;
  private httpClient!: Client;

  constructor(private readonly configService: ConfigService) {
    this.adminUrl = this.configService.getOrThrow<string>('stalwart.adminUrl');
    this.adminToken = this.configService.getOrThrow<string>(
      'stalwart.adminToken',
    );
  }

  onModuleInit() {
    this.httpClient = new Client(this.adminUrl, {
      allowH2: true,
      keepAliveTimeout: 30_000,
      pipelining: 1,
    });
    this.logger.log(
      `Stalwart admin client initialized targeting ${this.adminUrl}`,
    );
  }

  async onModuleDestroy() {
    await this.httpClient.close();
  }

  async createPrincipal(principal: StalwartPrincipal): Promise<void> {
    const { statusCode, body } = await this.httpClient.request({
      method: 'POST',
      path: '/api/principal',
      headers: this.headers(),
      body: JSON.stringify(principal),
    });

    const text = await body.text();

    if (statusCode !== 200 && statusCode !== 201) {
      throw new StalwartApiError(
        `Failed to create principal '${principal.name}': HTTP ${statusCode}`,
        statusCode,
        text,
      );
    }
  }

  async getPrincipal(name: string): Promise<StalwartPrincipal | null> {
    const { statusCode, body } = await this.httpClient.request({
      method: 'GET',
      path: `/api/principal/${encodeURIComponent(name)}`,
      headers: this.headers(),
    });

    const text = await body.text();

    if (statusCode === 404) {
      return null;
    }

    if (statusCode !== 200) {
      throw new StalwartApiError(
        `Failed to get principal '${name}': HTTP ${statusCode}`,
        statusCode,
        text,
      );
    }

    const response = JSON.parse(text) as { data: StalwartPrincipal };
    return response.data;
  }

  async patchPrincipal(
    name: string,
    operations: PatchOperation[],
  ): Promise<void> {
    const { statusCode, body } = await this.httpClient.request({
      method: 'PATCH',
      path: `/api/principal/${encodeURIComponent(name)}`,
      headers: this.headers(),
      body: JSON.stringify(operations),
    });

    const text = await body.text();

    if (statusCode !== 200 && statusCode !== 204) {
      throw new StalwartApiError(
        `Failed to patch principal '${name}': HTTP ${statusCode}`,
        statusCode,
        text,
      );
    }
  }

  async deletePrincipal(name: string): Promise<void> {
    const { statusCode, body } = await this.httpClient.request({
      method: 'DELETE',
      path: `/api/principal/${encodeURIComponent(name)}`,
      headers: this.headers(),
    });

    const text = await body.text();

    if (statusCode !== 200 && statusCode !== 204) {
      throw new StalwartApiError(
        `Failed to delete principal '${name}': HTTP ${statusCode}`,
        statusCode,
        text,
      );
    }
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.adminToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    };
  }
}

export class StalwartApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details: string,
  ) {
    super(message);
    this.name = 'StalwartApiError';
  }
}
