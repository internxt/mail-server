import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PaymentsService, PaymentsApiError } from './payments.service.js';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let jwtService: DeepMocked<JwtService>;
  let httpRequest: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    httpRequest = vi.fn();

    const configService = createMock<ConfigService>();
    configService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'apis.payments.url') return 'http://payments.test';
      if (key === 'secrets.jwt') return 'test-secret';
      throw new Error(`unknown key: ${key}`);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: ConfigService, useValue: configService },
        { provide: JwtService, useValue: createMock<JwtService>() },
      ],
    }).compile();

    service = module.get(PaymentsService);
    jwtService = module.get(JwtService);
    (
      service as unknown as { httpClient: { request: typeof httpRequest } }
    ).httpClient = {
      request: httpRequest,
    };
  });

  describe('getUserTier', () => {
    it('when payments returns 200, then returns parsed tier', async () => {
      const tier = {
        id: 't1',
        label: 'pro',
        productId: 'p1',
        billingType: 'monthly',
        featuresPerService: { mail: { enabled: true, addressesPerUser: 3 } },
      };
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 200,
        body: { text: () => Promise.resolve(JSON.stringify(tier)) },
      });

      const result = await service.getUserTier('user-1');

      expect(result).toStrictEqual(tier);
      expect(jwtService.sign).toHaveBeenCalledWith(
        { payload: { uuid: 'user-1', workspaces: { owners: ['user-1'] } } },
        { secret: 'test-secret' },
      );
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/products/tier',
          headers: expect.objectContaining({
            authorization: 'Bearer signed-jwt',
          }) as unknown,
        }),
      );
    });

    it('when payments returns non-200, then throws PaymentsApiError', async () => {
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 500,
        body: { text: () => Promise.resolve('boom') },
      });

      await expect(service.getUserTier('user-1')).rejects.toThrow(
        PaymentsApiError,
      );
    });
  });
});
