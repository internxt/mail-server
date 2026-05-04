import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type ConfigService } from '@nestjs/config';
import { StalwartService, StalwartApiError } from './stalwart.service.js';

const mockRequest = vi.fn();
vi.mock('undici', () => ({
  Client: vi.fn().mockImplementation(() => ({
    request: mockRequest,
    close: vi.fn(),
  })),
}));

function createConfigService(): ConfigService {
  const config: Record<string, string> = {
    'stalwart.adminUrl': 'http://localhost:8080',
    'stalwart.adminUser': 'admin',
    'stalwart.adminSecret': 'secret',
  };
  return {
    getOrThrow: vi.fn((key: string) => {
      const value = config[key];
      if (!value) throw new Error(`Missing config: ${key}`);
      return value;
    }),
  } as unknown as ConfigService;
}

function jmapResponse(invocations: unknown[]) {
  return {
    statusCode: 200,
    body: {
      text: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ methodResponses: invocations, sessionState: 's' }),
        ),
    },
  };
}

function httpResponse(statusCode: number, body: string | object) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { statusCode, body: { text: vi.fn().mockResolvedValue(text) } };
}

function queryResp(method: string, ids: string[], callId = 'q1') {
  return [
    method,
    {
      accountId: 'a',
      queryState: 'q',
      canCalculateChanges: false,
      position: 0,
      ids,
    },
    callId,
  ];
}

function getResp<T>(method: string, list: T[], callId = 'g1') {
  return [method, { accountId: 'a', state: 's', list, notFound: [] }, callId];
}

function setResp(
  method: string,
  patch: {
    created?: Record<string, unknown> | null;
    notCreated?: Record<string, unknown> | null;
    destroyed?: string[] | null;
    notDestroyed?: Record<string, unknown> | null;
  },
  callId = 's1',
) {
  return [
    method,
    {
      accountId: 'a',
      oldState: null,
      newState: 's',
      created: patch.created ?? null,
      notCreated: patch.notCreated ?? null,
      updated: null,
      destroyed: patch.destroyed ?? null,
      notUpdated: null,
      notDestroyed: patch.notDestroyed ?? null,
    },
    callId,
  ];
}

function bodyOf(callIndex: number) {
  const [callArgs] = mockRequest.mock.calls[callIndex]! as [{ body: string }];
  return JSON.parse(callArgs.body) as {
    using: string[];
    methodCalls: [string, Record<string, unknown>, string][];
  };
}

const DOMAIN_BATCH_HIT = jmapResponse([
  queryResp('x:Domain/query', ['dom1']),
  getResp('x:Domain/get', [{ id: 'dom1', name: 'test.com' }]),
]);

describe('StalwartService', () => {
  let service: StalwartService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StalwartService(createConfigService());
    service.onModuleInit();
  });

  describe('createAccount', () => {
    it('when JMAP creates the account, then returns the new id', async () => {
      mockRequest.mockResolvedValueOnce(
        jmapResponse([
          setResp('x:Account/set', { created: { new1: { id: 'acc1' } } }),
        ]),
      );

      const id = await service.createAccount({
        name: 'alice',
        domainId: 'dom1',
        description: 'Alice',
        password: 'pw',
        quotaBytes: 5_000_000,
      });

      expect(id).toBe('acc1');
      const body = bodyOf(0);
      expect(body.using).toContain('urn:stalwart:jmap');
      const create = (
        body.methodCalls[0]![1] as { create: { new1: Record<string, unknown> } }
      ).create.new1;
      expect(create).toMatchObject({
        '@type': 'User',
        name: 'alice',
        domainId: 'dom1',
        description: 'Alice',
        credentials: { '@type': 'Password', secret: 'pw' },
        roles: { '@type': 'User' },
        quotas: { maxDiskQuota: 5_000_000 },
      });
    });

    it('when quota is zero, then quotas field is omitted', async () => {
      mockRequest.mockResolvedValueOnce(
        jmapResponse([
          setResp('x:Account/set', { created: { new1: { id: 'acc1' } } }),
        ]),
      );

      await service.createAccount({
        name: 'alice',
        domainId: 'dom1',
        password: 'pw',
        quotaBytes: 0,
      });

      const create = (
        bodyOf(0).methodCalls[0]![1] as {
          create: { new1: Record<string, unknown> };
        }
      ).create.new1;
      expect(create.quotas).toBeUndefined();
    });

    it('when JMAP reports notCreated, then throws StalwartApiError', async () => {
      mockRequest.mockResolvedValueOnce(
        jmapResponse([
          setResp('x:Account/set', {
            notCreated: {
              new1: { type: 'alreadyExists', description: 'duplicate' },
            },
          }),
        ]),
      );

      await expect(
        service.createAccount({
          name: 'alice',
          domainId: 'dom1',
          password: 'pw',
        }),
      ).rejects.toThrow(StalwartApiError);
    });

    it('when HTTP fails, then throws StalwartApiError', async () => {
      mockRequest.mockResolvedValueOnce(httpResponse(401, 'unauthorized'));

      await expect(
        service.createAccount({
          name: 'alice',
          domainId: 'dom1',
          password: 'pw',
        }),
      ).rejects.toThrow(StalwartApiError);
    });
  });

  describe('getAccountByEmail', () => {
    it('when account exists, then batches query+get with a back-reference', async () => {
      mockRequest.mockResolvedValueOnce(DOMAIN_BATCH_HIT).mockResolvedValueOnce(
        jmapResponse([
          queryResp('x:Account/query', ['acc1']),
          getResp('x:Account/get', [
            {
              id: 'acc1',
              '@type': 'User',
              name: 'alice',
              emailAddress: 'alice@test.com',
              domainId: 'dom1',
              description: 'Alice',
              quotas: { maxDiskQuota: 5_000_000 },
            },
          ]),
        ]),
      );

      const result = await service.getAccountByEmail('alice@test.com');

      expect(result).toMatchObject({
        id: 'acc1',
        emailAddress: 'alice@test.com',
        description: 'Alice',
      });
      expect(mockRequest).toHaveBeenCalledTimes(2);

      const accountCalls = bodyOf(1).methodCalls;
      expect(accountCalls[0]![1]).toEqual({
        filter: { name: 'alice', domainId: 'dom1' },
      });
      expect(accountCalls[1]![1]).toEqual({
        '#ids': {
          resultOf: 'q1',
          name: 'x:Account/query',
          path: '/ids',
        },
      });
    });

    it('when domain not found, then returns null without querying accounts', async () => {
      mockRequest.mockResolvedValueOnce(
        jmapResponse([
          queryResp('x:Domain/query', []),
          getResp('x:Domain/get', []),
        ]),
      );

      const result = await service.getAccountByEmail('alice@unknown.com');

      expect(result).toBeNull();
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('when account not found, then returns null', async () => {
      mockRequest
        .mockResolvedValueOnce(DOMAIN_BATCH_HIT)
        .mockResolvedValueOnce(
          jmapResponse([
            queryResp('x:Account/query', []),
            getResp('x:Account/get', []),
          ]),
        );

      const result = await service.getAccountByEmail('ghost@test.com');

      expect(result).toBeNull();
    });
  });

  describe('deleteAccountByEmail', () => {
    it('when account exists, then batches query+set destroy with a back-reference', async () => {
      mockRequest
        .mockResolvedValueOnce(DOMAIN_BATCH_HIT)
        .mockResolvedValueOnce(
          jmapResponse([
            queryResp('x:Account/query', ['acc1']),
            setResp('x:Account/set', { destroyed: ['acc1'] }),
          ]),
        );

      await expect(
        service.deleteAccountByEmail('alice@test.com'),
      ).resolves.toBeUndefined();

      expect(mockRequest).toHaveBeenCalledTimes(2);
      const setCall = bodyOf(1).methodCalls[1]!;
      expect(setCall[1]).toEqual({
        '#destroy': {
          resultOf: 'q1',
          name: 'x:Account/query',
          path: '/ids',
        },
      });
    });

    it('when account not found, then throws StalwartApiError', async () => {
      mockRequest
        .mockResolvedValueOnce(DOMAIN_BATCH_HIT)
        .mockResolvedValueOnce(
          jmapResponse([
            queryResp('x:Account/query', []),
            setResp('x:Account/set', { destroyed: [] }),
          ]),
        );

      await expect(
        service.deleteAccountByEmail('ghost@test.com'),
      ).rejects.toThrow(StalwartApiError);
    });

    it('when JMAP reports notDestroyed, then throws StalwartApiError', async () => {
      mockRequest.mockResolvedValueOnce(DOMAIN_BATCH_HIT).mockResolvedValueOnce(
        jmapResponse([
          queryResp('x:Account/query', ['acc1']),
          setResp('x:Account/set', {
            notDestroyed: { acc1: { type: 'forbidden' } },
          }),
        ]),
      );

      await expect(
        service.deleteAccountByEmail('alice@test.com'),
      ).rejects.toThrow(StalwartApiError);
    });
  });

  describe('resolveDomainId', () => {
    it('when domain matches, then caches and returns the id in one batched call', async () => {
      mockRequest.mockResolvedValueOnce(DOMAIN_BATCH_HIT);

      const id = await service.resolveDomainId('test.com');
      expect(id).toBe('dom1');

      const cached = await service.resolveDomainId('test.com');
      expect(cached).toBe('dom1');
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('when text query returns a different domain, then ignores it', async () => {
      mockRequest.mockResolvedValueOnce(
        jmapResponse([
          queryResp('x:Domain/query', ['dom1']),
          getResp('x:Domain/get', [{ id: 'dom1', name: 'othertest.com' }]),
        ]),
      );

      const id = await service.resolveDomainId('test.com');
      expect(id).toBeNull();
    });

    it('when query returns no results, then returns null', async () => {
      mockRequest.mockResolvedValueOnce(
        jmapResponse([
          queryResp('x:Domain/query', []),
          getResp('x:Domain/get', []),
        ]),
      );

      const id = await service.resolveDomainId('nope.com');
      expect(id).toBeNull();
    });
  });

  describe('auth', () => {
    it('when request is made, then includes admin Basic auth header', async () => {
      mockRequest.mockResolvedValueOnce(
        jmapResponse([
          queryResp('x:Domain/query', []),
          getResp('x:Domain/get', []),
        ]),
      );

      await service.resolveDomainId('test.com');

      const expected = `Basic ${Buffer.from('admin:secret').toString('base64')}`;
      const callArgs = mockRequest.mock.calls[0]![0] as {
        headers: Record<string, string>;
      };
      expect(callArgs.headers.authorization).toBe(expected);
    });
  });
});
