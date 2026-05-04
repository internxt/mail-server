import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { StalwartAccountProvider } from './stalwart-account.provider.js';
import { StalwartApiError, StalwartService } from './stalwart.service.js';
import { newCreateAccountParams } from '../../../../test/fixtures.js';

describe('StalwartAccountProvider', () => {
  let provider: StalwartAccountProvider;
  let stalwart: DeepMocked<StalwartService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StalwartAccountProvider],
    })
      .useMocker(() => createMock<object>())
      .compile();

    provider = module.get(StalwartAccountProvider);
    stalwart = module.get(StalwartService);
  });

  describe('createAccount', () => {
    it('when called, then resolves the domain and creates the account', async () => {
      const params = newCreateAccountParams({
        primaryAddress: 'alice@example.com',
      });
      stalwart.resolveDomainId.mockResolvedValue('dom1');

      await provider.createAccount(params);

      expect(stalwart.resolveDomainId).toHaveBeenCalledWith('example.com');
      expect(stalwart.createAccount).toHaveBeenCalledWith({
        name: 'alice',
        domainId: 'dom1',
        description: params.displayName,
        password: params.password,
        quotaBytes: params.quota ?? 0,
      });
    });

    it('when domain is not configured, then throws and does not create', async () => {
      const params = newCreateAccountParams({
        primaryAddress: 'alice@unknown.com',
      });
      stalwart.resolveDomainId.mockResolvedValue(null);

      await expect(provider.createAccount(params)).rejects.toThrow(
        StalwartApiError,
      );
      expect(stalwart.createAccount).not.toHaveBeenCalled();
    });

    it('when quota is undefined, then defaults to 0', async () => {
      const params = newCreateAccountParams({
        primaryAddress: 'alice@example.com',
        quota: undefined,
      });
      stalwart.resolveDomainId.mockResolvedValue('dom1');

      await provider.createAccount(params);

      expect(stalwart.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ quotaBytes: 0 }),
      );
    });
  });

  describe('deleteAccount', () => {
    it('when called, then delegates to stalwart service', async () => {
      await provider.deleteAccount('user@example.com');

      expect(stalwart.deleteAccountByEmail).toHaveBeenCalledWith(
        'user@example.com',
      );
    });
  });

  describe('getAccount', () => {
    it('when account exists, then returns AccountInfo with full email as name', async () => {
      stalwart.getAccountByEmail.mockResolvedValue({
        id: 'acc1',
        '@type': 'User',
        name: 'user',
        emailAddress: 'user@example.com',
        domainId: 'dom1',
        description: 'User Name',
        quotas: { maxDiskQuota: 5_000_000 },
      });

      const result = await provider.getAccount('user@example.com');

      expect(result).toEqual({
        name: 'user@example.com',
        displayName: 'User Name',
        emails: ['user@example.com'],
        quota: 5_000_000,
      });
    });

    it('when account does not exist, then returns null', async () => {
      stalwart.getAccountByEmail.mockResolvedValue(null);

      const result = await provider.getAccount('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('when account has no optional fields, then uses defaults', async () => {
      stalwart.getAccountByEmail.mockResolvedValue({
        id: 'acc1',
        '@type': 'User',
        name: 'user',
        emailAddress: 'user@example.com',
        domainId: 'dom1',
      });

      const result = await provider.getAccount('user@example.com');

      expect(result).toEqual({
        name: 'user@example.com',
        displayName: '',
        emails: ['user@example.com'],
        quota: 0,
      });
    });
  });
});
