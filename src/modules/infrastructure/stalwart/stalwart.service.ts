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
  private readonly adminUser: string;
  private readonly adminSecret: string;
  private httpClient!: Client;

  constructor(private readonly configService: ConfigService) {
    this.adminUrl = this.configService.getOrThrow<string>('stalwart.adminUrl');
    this.adminUser =
      this.configService.getOrThrow<string>('stalwart.adminUser');
    this.adminSecret = this.configService.getOrThrow<string>(
      'stalwart.adminSecret',
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

    this.assertNoBodyError(
      statusCode,
      text,
      `Failed to create principal '${principal.name}'`,
    );
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

    this.assertNoBodyError(
      statusCode,
      text,
      `Failed to get principal '${name}'`,
    );

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

    this.assertNoBodyError(
      statusCode,
      text,
      `Failed to patch principal '${name}'`,
    );
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

    this.assertNoBodyError(
      statusCode,
      text,
      `Failed to delete principal '${name}'`,
    );
  }

  private assertNoBodyError(
    statusCode: number,
    text: string,
    context: string,
  ): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      const { error, details } = parsed as { error: string; details?: string };
      throw new StalwartApiError(
        `${context}: ${error}${details ? ` — ${details}` : ''}`,
        statusCode,
        text,
      );
    }
  }

  private headers(): Record<string, string> {
    const credentials = Buffer.from(
      `${this.adminUser}:${this.adminSecret}`,
    ).toString('base64');
    return {
      authorization: `Basic ${credentials}`,
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
