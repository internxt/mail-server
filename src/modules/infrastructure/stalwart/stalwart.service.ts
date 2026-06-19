import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'undici';
import type {
  ID,
  JmapGetResponse,
  JmapInvocation,
  JmapMethodCall,
  JmapQueryResponse,
  JmapResponse,
  JmapSetResponse,
} from '../jmap/jmap.types.js';

const JMAP_API_PATH = '/jmap';
const CAPABILITY_CORE = 'urn:ietf:params:jmap:core';
const CAPABILITY_STALWART = 'urn:stalwart:jmap';
const ADMIN_CAPABILITIES = [CAPABILITY_CORE, CAPABILITY_STALWART] as const;

const JMAP_METHOD = {
  ACCOUNT_GET: 'x:Account/get',
  ACCOUNT_QUERY: 'x:Account/query',
  ACCOUNT_SET: 'x:Account/set',
  DOMAIN_GET: 'x:Domain/get',
  DOMAIN_QUERY: 'x:Domain/query',
} as const;

const TYPE_USER = 'User';
const TYPE_PASSWORD = 'Password';
const CREATE_REF = 'new1';

const SUSPEND_PERMISSIONS = ['email-receive', 'email-send'] as const;

export interface StalwartAccountCreate {
  name: string;
  domainId: string;
  description?: string;
  password: string;
  quotaBytes?: number;
}

export interface StalwartAccount {
  id: ID;
  '@type': 'User' | 'Group';
  name: string;
  emailAddress: string;
  domainId: ID;
  description?: string;
  quotas?: Record<string, number>;
}

@Injectable()
export class StalwartService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StalwartService.name);
  private readonly adminUrl: string;
  private readonly adminUser: string;
  private readonly adminSecret: string;
  private readonly domainIdMap = new Map<string, ID>();
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
      `Stalwart admin JMAP client initialized targeting ${this.adminUrl}`,
    );
  }

  async onModuleDestroy() {
    await this.httpClient.close();
  }

  async createAccount(params: StalwartAccountCreate): Promise<ID> {
    const create: Record<string, unknown> = {
      '@type': TYPE_USER,
      name: params.name,
      domainId: params.domainId,
      credentials: { '0': { '@type': TYPE_PASSWORD, secret: params.password } },
      roles: { '@type': TYPE_USER },
      permissions: { '@type': 'Inherit' },
    };
    if (params.description !== undefined) {
      create.description = params.description;
    }
    if (params.quotaBytes) {
      create.quotas = { maxDiskQuota: params.quotaBytes };
    }

    const response = await this.jmapCall<JmapSetResponse<StalwartAccount>>([
      [JMAP_METHOD.ACCOUNT_SET, { create: { [CREATE_REF]: create } }, 'c1'],
    ]);
    const set = firstResponse(response);

    const failed = set.notCreated?.[CREATE_REF];
    if (failed) {
      throw new StalwartApiError(
        `Failed to create account '${params.name}'@${params.domainId}: ${failed.type} ${failed.description}`,
        failed,
      );
    }

    const created = set.created?.[CREATE_REF];
    if (!created?.id) {
      throw new StalwartApiError(
        `Account creation returned no id for '${params.name}'`,
        set,
      );
    }
    return created.id;
  }

  async getAccountByEmail(email: string): Promise<StalwartAccount | null> {
    const { local, domain } = splitEmail(email);
    const domainId = await this.resolveDomainId(domain);
    if (!domainId) return null;

    const response = await this.jmapCall<
      JmapQueryResponse | JmapGetResponse<StalwartAccount>
    >([
      [JMAP_METHOD.ACCOUNT_QUERY, { filter: { name: local, domainId } }, 'q1'],
      [
        JMAP_METHOD.ACCOUNT_GET,
        {
          '#ids': {
            resultOf: 'q1',
            name: JMAP_METHOD.ACCOUNT_QUERY,
            path: '/ids',
          },
        },
        'g1',
      ],
    ]);
    const get = response
      .methodResponses[1]![1] as JmapGetResponse<StalwartAccount>;
    return get.list[0] ?? null;
  }

  async deleteAccountByEmail(email: string): Promise<void> {
    const { local, domain } = splitEmail(email);
    const domainId = await this.resolveDomainId(domain);
    if (!domainId) {
      throw new StalwartApiError(`Account '${email}' not found`, null);
    }

    const response = await this.jmapCall<
      JmapQueryResponse | JmapSetResponse<StalwartAccount>
    >([
      [JMAP_METHOD.ACCOUNT_QUERY, { filter: { name: local, domainId } }, 'q1'],
      [
        JMAP_METHOD.ACCOUNT_SET,
        {
          '#destroy': {
            resultOf: 'q1',
            name: JMAP_METHOD.ACCOUNT_QUERY,
            path: '/ids',
          },
        },
        's1',
      ],
    ]);
    const query = response.methodResponses[0]![1] as JmapQueryResponse;
    if (query.ids.length === 0) {
      throw new StalwartApiError(`Account '${email}' not found`, null);
    }

    const set = response
      .methodResponses[1]![1] as JmapSetResponse<StalwartAccount>;
    const targetId = query.ids[0]!;
    const failed = set.notDestroyed?.[targetId];
    if (failed) {
      throw new StalwartApiError(
        `Failed to delete account '${email}': ${failed.type} ${failed.description}`,
        failed,
      );
    }
  }

  async suspendAccountByEmail(email: string): Promise<void> {
    await this.setSuspended(email, true);
  }

  async reactivateAccountByEmail(email: string): Promise<void> {
    await this.setSuspended(email, false);
  }

  private async setSuspended(email: string, suspended: boolean): Promise<void> {
    const account = await this.getAccountByEmail(email);
    if (!account) {
      throw new StalwartApiError(`Account '${email}' not found`, null);
    }

    const patch: Record<string, true | null> = {};
    for (const permission of SUSPEND_PERMISSIONS) {
      patch[`disabledPermissions/${permission}`] = suspended ? true : null;
    }

    const response = await this.jmapCall<JmapSetResponse<StalwartAccount>>([
      [JMAP_METHOD.ACCOUNT_SET, { update: { [account.id]: patch } }, 's1'],
    ]);
    const set = firstResponse(response);

    const failed = set.notUpdated?.[account.id];
    if (failed) {
      throw new StalwartApiError(
        `Failed to ${suspended ? 'suspend' : 'reactivate'} account '${email}': ${failed.type} ${failed.description}`,
        failed,
      );
    }
  }

  async resolveDomainId(domain: string): Promise<ID | null> {
    const cached = this.domainIdMap.get(domain);
    if (cached) return cached;

    // Domain/query's `text` filter is fuzzy/substring, so verify exact name
    // match against the resolved Domain/get list before caching.
    const response = await this.jmapCall<
      JmapQueryResponse | JmapGetResponse<{ id: ID; name: string }>
    >([
      [JMAP_METHOD.DOMAIN_QUERY, { filter: { text: domain } }, 'q1'],
      [
        JMAP_METHOD.DOMAIN_GET,
        {
          '#ids': {
            resultOf: 'q1',
            name: JMAP_METHOD.DOMAIN_QUERY,
            path: '/ids',
          },
        },
        'g1',
      ],
    ]);
    const get = response.methodResponses[1]![1] as JmapGetResponse<{
      id: ID;
      name: string;
    }>;
    const match = get.list.find(
      (d) => d.name.toLowerCase() === domain.toLowerCase(),
    );
    if (!match) return null;

    this.domainIdMap.set(domain, match.id);
    return match.id;
  }

  private async jmapCall<T>(
    methodCalls: JmapMethodCall[],
  ): Promise<JmapResponse<JmapInvocation<T>[]>> {
    const { statusCode, body } = await this.httpClient.request({
      method: 'POST',
      path: JMAP_API_PATH,
      headers: this.headers(),
      body: JSON.stringify({
        using: ADMIN_CAPABILITIES as readonly string[],
        methodCalls,
      }),
    });

    const text = await body.text();

    if (statusCode !== 200) {
      throw new StalwartApiError(
        `JMAP admin request failed: HTTP ${statusCode}`,
        text,
      );
    }

    const response = JSON.parse(text) as JmapResponse<JmapInvocation<T>[]>;
    const errors = response.methodResponses.filter(([n]) => n === 'error');
    if (errors.length > 0) {
      throw new StalwartApiError('JMAP admin method error', errors);
    }
    if (response.methodResponses.length !== methodCalls.length) {
      throw new StalwartApiError(
        `JMAP admin response shape mismatch: expected ${methodCalls.length} method response(s), got ${response.methodResponses.length}`,
        response,
      );
    }
    return response;
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

export function splitEmail(email: string): { local: string; domain: string } {
  const idx = email.lastIndexOf('@');
  if (idx <= 0 || idx === email.length - 1) {
    throw new StalwartApiError(`Invalid email '${email}'`, null);
  }
  return { local: email.slice(0, idx), domain: email.slice(idx + 1) };
}

function firstResponse<T>(response: JmapResponse<JmapInvocation<T>[]>): T {
  return response.methodResponses[0]![1];
}

export class StalwartApiError extends Error {
  constructor(
    message: string,
    public readonly details: unknown,
  ) {
    super(message);
    this.name = 'StalwartApiError';
  }
}
