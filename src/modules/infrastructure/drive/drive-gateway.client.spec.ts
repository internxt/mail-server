import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import {
  DriveGatewayClient,
  DriveGatewayError,
} from './drive-gateway.client.js';

describe('DriveGatewayClient', () => {
  let client: DriveGatewayClient;
  let jwtService: DeepMocked<JwtService>;
  let httpRequest: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    httpRequest = vi.fn();

    const configService = createMock<ConfigService>();
    configService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'apis.drive.url') return 'http://drive.test';
      if (key === 'secrets.gatewayPrivate')
        return Buffer.from('fake-private-key').toString('base64');
      throw new Error(`unknown key: ${key}`);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriveGatewayClient,
        { provide: ConfigService, useValue: configService },
        { provide: JwtService, useValue: createMock<JwtService>() },
      ],
    }).compile();

    client = module.get(DriveGatewayClient);
    jwtService = module.get(JwtService);

    (
      client as unknown as { httpClient: { request: typeof httpRequest } }
    ).httpClient = {
      request: httpRequest,
    };
  });

  describe('verifyPassword', () => {
    it('when drive returns 200, then resolves without error', async () => {
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 200,
        body: { text: () => Promise.resolve('') },
      });

      await expect(
        client.verifyPassword('user-1', 'enc'),
      ).resolves.toBeUndefined();

      expect(jwtService.sign).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          algorithm: 'RS256',
          secret: 'fake-private-key',
          expiresIn: '5m',
        }),
      );
      expect(httpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/gateway/users/user-1/verify-password',
          body: JSON.stringify({ encryptedPassword: 'enc' }),
        }),
      );
    });

    it('when drive returns 401, then throws UnauthorizedException', async () => {
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 401,
        body: { text: () => Promise.resolve('unauthorized') },
      });

      await expect(client.verifyPassword('user-1', 'enc')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('when drive returns 500, then throws DriveGatewayError', async () => {
      jwtService.sign.mockReturnValue('signed-jwt');
      httpRequest.mockResolvedValue({
        statusCode: 500,
        body: { text: () => Promise.resolve('boom') },
      });

      await expect(client.verifyPassword('user-1', 'enc')).rejects.toThrow(
        DriveGatewayError,
      );
    });
  });
});
