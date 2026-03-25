import { describe, it, expect, beforeEach, vi } from 'vitest';
import { type ConfigService } from '@nestjs/config';
import { StalwartService, StalwartApiError } from './stalwart.service.js';

// Mock undici Client
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

function mockResponse(statusCode: number, responseBody: string | object) {
  const text =
    typeof responseBody === 'string'
      ? responseBody
      : JSON.stringify(responseBody);
  return { statusCode, body: { text: vi.fn().mockResolvedValue(text) } };
}

describe('StalwartService', () => {
  let service: StalwartService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StalwartService(createConfigService());
    service.onModuleInit();
  });

  describe('createPrincipal', () => {
    it('when server returns 201, then succeeds', async () => {
      mockRequest.mockResolvedValue(mockResponse(201, 'ok'));

      await expect(
        service.createPrincipal({
          name: 'user@test.com',
          type: 'individual',
        }),
      ).resolves.toBeUndefined();

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/api/principal',
        }),
      );
    });

    it('when server returns 200, then succeeds', async () => {
      mockRequest.mockResolvedValue(mockResponse(200, 'ok'));

      await expect(
        service.createPrincipal({
          name: 'user@test.com',
          type: 'individual',
        }),
      ).resolves.toBeUndefined();
    });

    it('when server returns error, then throws StalwartApiError', async () => {
      mockRequest.mockResolvedValue(mockResponse(409, 'conflict'));

      await expect(
        service.createPrincipal({
          name: 'user@test.com',
          type: 'individual',
        }),
      ).rejects.toThrow(StalwartApiError);
    });
  });

  describe('getPrincipal', () => {
    it('when principal exists, then returns parsed data', async () => {
      const principal = {
        name: 'user@test.com',
        type: 'individual',
        emails: ['user@test.com'],
      };
      mockRequest.mockResolvedValue(mockResponse(200, { data: principal }));

      const result = await service.getPrincipal('user@test.com');

      expect(result).toEqual(principal);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/api/principal/user%40test.com',
        }),
      );
    });

    it('when principal not found, then returns null', async () => {
      mockRequest.mockResolvedValue(mockResponse(404, 'not found'));

      const result = await service.getPrincipal('unknown@test.com');

      expect(result).toBeNull();
    });

    it('when server returns error, then throws StalwartApiError', async () => {
      mockRequest.mockResolvedValue(mockResponse(500, 'internal error'));

      await expect(service.getPrincipal('user@test.com')).rejects.toThrow(
        StalwartApiError,
      );
    });
  });

  describe('patchPrincipal', () => {
    it('when server returns 200, then succeeds', async () => {
      mockRequest.mockResolvedValue(mockResponse(200, 'ok'));

      await expect(
        service.patchPrincipal('user@test.com', [
          { action: 'addItem', field: 'emails', value: 'alias@test.com' },
        ]),
      ).resolves.toBeUndefined();

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          path: '/api/principal/user%40test.com',
        }),
      );
    });

    it('when server returns 204, then succeeds', async () => {
      mockRequest.mockResolvedValue(mockResponse(204, ''));

      await expect(
        service.patchPrincipal('user@test.com', [
          { action: 'set', field: 'quota', value: 1000 },
        ]),
      ).resolves.toBeUndefined();
    });

    it('when server returns error, then throws StalwartApiError', async () => {
      mockRequest.mockResolvedValue(mockResponse(400, 'bad request'));

      await expect(service.patchPrincipal('user@test.com', [])).rejects.toThrow(
        StalwartApiError,
      );
    });
  });

  describe('deletePrincipal', () => {
    it('when server returns 200, then succeeds', async () => {
      mockRequest.mockResolvedValue(mockResponse(200, 'ok'));

      await expect(
        service.deletePrincipal('user@test.com'),
      ).resolves.toBeUndefined();

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          path: '/api/principal/user%40test.com',
        }),
      );
    });

    it('when server returns 204, then succeeds', async () => {
      mockRequest.mockResolvedValue(mockResponse(204, ''));

      await expect(
        service.deletePrincipal('user@test.com'),
      ).resolves.toBeUndefined();
    });

    it('when server returns error, then throws StalwartApiError', async () => {
      mockRequest.mockResolvedValue(mockResponse(404, 'not found'));

      await expect(service.deletePrincipal('unknown@test.com')).rejects.toThrow(
        StalwartApiError,
      );
    });
  });

  describe('headers', () => {
    it('when request is made, then includes Basic auth with correct credentials', async () => {
      mockRequest.mockResolvedValue(mockResponse(200, { data: {} }));

      await service.getPrincipal('test');

      const expectedAuth = `Basic ${Buffer.from('admin:secret').toString('base64')}`;
      const callArgs = mockRequest.mock.calls[0]![0] as {
        headers: Record<string, string>;
      };
      expect(callArgs.headers.authorization).toBe(expectedAuth);
      expect(callArgs.headers['content-type']).toBe('application/json');
      expect(callArgs.headers.accept).toBe('application/json');
    });
  });
});
