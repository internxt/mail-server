import { describe, it, expect, beforeEach, vi } from 'vitest';
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

  describe('reportMailUsage', () => {
    it('when Bridge returns 200, then signs a gateway token, PUTs usage, and returns storage', async () => {
      const storage = { driveUsed: 1024, planQuota: 5368709120 };
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 200,
        body: { text: () => Promise.resolve(JSON.stringify(storage)) },
      });

      const result = await service.reportMailUsage('user-1', 512);

      expect(result).toStrictEqual(storage);
      expect(jwtService.sign).toHaveBeenCalledWith(
        { payload: { uuid: 'user-1' } },
        { secret: 'test-key', algorithm: 'RS256', expiresIn: '1m' },
      );
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          path: '/v2/gateway/users/user-1/mail-usage',
          body: JSON.stringify({ mailUsedBytes: 512 }),
          headers: expect.objectContaining({
            authorization: 'Bearer signed-jwt',
          }) as unknown,
        }),
      );
    });

    it('when Bridge returns a non-200 status, then throws BridgeApiError with statusCode and details', async () => {
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 500,
        body: { text: () => Promise.resolve('internal error') },
      });

      const error: unknown = await service
        .reportMailUsage('user-1', 512)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BridgeApiError);
      if (!(error instanceof BridgeApiError)) {
        throw new Error('expected BridgeApiError');
      }
      expect(error.statusCode).toBe(500);
      expect(error.details).toBe('internal error');
    });

    it('when the HTTP request throws, then the error propagates', async () => {
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockRejectedValue(new Error('network failure'));

      await expect(service.reportMailUsage('user-1', 512)).rejects.toThrow(
        'network failure',
      );
    });
  });
});
