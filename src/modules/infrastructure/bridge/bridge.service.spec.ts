import { describe, it, test, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BridgeClient, BridgeApiError } from './bridge.service.js';

describe('BridgeClient', () => {
  let service: BridgeClient;
  let jwtService: DeepMocked<JwtService>;
  let httpRequest: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    httpRequest = vi.fn();

    const configService = createMock<ConfigService>();
    configService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'apis.bridge.url') return 'http://bridge.test';
      if (key === 'secrets.bridgePrivateGateway')
        return Buffer.from('test-key').toString('base64');
      if (key === 'isProduction') return false;
      throw new Error(`unknown key: ${key}`);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BridgeClient,
        { provide: ConfigService, useValue: configService },
        { provide: JwtService, useValue: createMock<JwtService>() },
      ],
    }).compile();

    service = module.get(BridgeClient);
    jwtService = module.get(JwtService);
    (
      service as unknown as { httpClient: { request: typeof httpRequest } }
    ).httpClient = {
      request: httpRequest,
    };
  });

  describe('createMailBucket', () => {
    it('when Bridge returns 200, then signs a gateway token, POSTs the name, and returns the bucket', async () => {
      const bucket = { id: 'bucket-1', name: 'account-1' };
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 200,
        body: { text: () => Promise.resolve(JSON.stringify(bucket)) },
      });

      const result = await service.createMailBucket('user-1', 'account-1');

      expect(result).toStrictEqual(bucket);
      expect(jwtService.sign).toHaveBeenCalledWith(
        { payload: { uuid: 'user-1' } },
        {
          secret: 'test-key',
          algorithm: 'RS256',
          expiresIn: '1m',
          allowInsecureKeySizes: true,
        },
      );
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v2/gateway/users/user-1/buckets',
          body: JSON.stringify({ name: 'account-1' }),
          headers: expect.objectContaining({
            authorization: 'Bearer signed-jwt',
          }) as unknown,
        }),
      );
    });

    it('when Bridge returns a non-200 status, then throws BridgeApiError', async () => {
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 500,
        body: { text: () => Promise.resolve('internal error') },
      });

      const error: unknown = await service
        .createMailBucket('user-1', 'account-1')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BridgeApiError);
      if (!(error instanceof BridgeApiError)) {
        throw new Error('expected BridgeApiError');
      }
      expect(error.statusCode).toBe(500);
      expect(error.details).toBe('internal error');
    });
  });

  describe('deleteMailBucket', () => {
    it('when Bridge returns 204, then signs a gateway token and DELETEs the bucket', async () => {
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 204,
        body: { text: () => Promise.resolve('') },
      });

      await service.deleteMailBucket('user-1', 'bucket-1');

      expect(jwtService.sign).toHaveBeenCalledWith(
        { payload: { uuid: 'user-1' } },
        {
          secret: 'test-key',
          algorithm: 'RS256',
          expiresIn: '1m',
          allowInsecureKeySizes: true,
        },
      );
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          path: '/v2/gateway/users/user-1/buckets/bucket-1',
          headers: expect.objectContaining({
            authorization: 'Bearer signed-jwt',
          }) as unknown,
        }),
      );
    });

    it('when Bridge returns a non-204 status, then throws BridgeApiError with statusCode and details', async () => {
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 404,
        body: { text: () => Promise.resolve('not found') },
      });

      const error: unknown = await service
        .deleteMailBucket('user-1', 'bucket-1')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BridgeApiError);
      if (!(error instanceof BridgeApiError)) {
        throw new Error('expected BridgeApiError');
      }
      expect(error.statusCode).toBe(404);
      expect(error.details).toBe('not found');
    });
  });

  describe('createBucketEntry', () => {
    test('when Bridge returns 200, then signs a token, POSTs only the size, and returns the entry', async () => {
      const entry = {
        id: 'entry-1',
        maxSpaceBytes: 1000,
        totalUsedSpaceBytes: 240,
      };
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 200,
        body: { text: () => Promise.resolve(JSON.stringify(entry)) },
      });

      const result = await service.createBucketEntry('user-1', 'bucket-1', 240);

      expect(result).toStrictEqual(entry);
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v2/gateway/users/user-1/buckets/bucket-1/entries',
          body: JSON.stringify({ size: 240 }),
          headers: expect.objectContaining({
            authorization: 'Bearer signed-jwt',
          }) as unknown,
        }),
      );
    });

    it('when Bridge returns a non-200 status, then throws BridgeApiError with statusCode and details', async () => {
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 404,
        body: { text: () => Promise.resolve('bucket not found') },
      });

      const error: unknown = await service
        .createBucketEntry('user-1', 'bucket-1', 240)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BridgeApiError);
      if (!(error instanceof BridgeApiError)) {
        throw new Error('expected BridgeApiError');
      }
      expect(error.statusCode).toBe(404);
      expect(error.details).toBe('bucket not found');
    });
  });

  describe('deleteBucketEntry', () => {
    test('when Bridge returns 200, then signs a token, DELETEs by entry id, and returns the snapshot', async () => {
      const snapshot = { maxSpaceBytes: 1000, totalUsedSpaceBytes: 0 };
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 200,
        body: { text: () => Promise.resolve(JSON.stringify(snapshot)) },
      });

      const result = await service.deleteBucketEntry(
        'user-1',
        'bucket-1',
        'entry-1',
      );

      expect(result).toStrictEqual(snapshot);
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          path: '/v2/gateway/users/user-1/buckets/bucket-1/entries/entry-1',
          headers: expect.objectContaining({
            authorization: 'Bearer signed-jwt',
          }) as unknown,
        }),
      );
    });

    it('when Bridge returns a non-200 status, then throws BridgeApiError with statusCode and details', async () => {
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 404,
        body: { text: () => Promise.resolve('entry not found') },
      });

      const error: unknown = await service
        .deleteBucketEntry('user-1', 'bucket-1', 'entry-1')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BridgeApiError);
      if (!(error instanceof BridgeApiError)) {
        throw new Error('expected BridgeApiError');
      }
      expect(error.statusCode).toBe(404);
      expect(error.details).toBe('entry not found');
    });
  });
});
