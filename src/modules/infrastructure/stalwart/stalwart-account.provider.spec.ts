import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { StalwartAccountProvider } from './stalwart-account.provider.js';
import { StalwartService } from './stalwart.service.js';
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
    it('when called, then creates principal with correct shape', async () => {
      const params = newCreateAccountParams();

      await provider.createAccount(params);

      expect(stalwart.createPrincipal).toHaveBeenCalledWith({
        type: 'individual',
        name: params.primaryAddress,
        description: params.displayName,
        secrets: [params.password],
        emails: [params.primaryAddress],
        quota: params.quota,
      });
    });

    it('when quota is undefined, then defaults to 0', async () => {
      const params = newCreateAccountParams({ quota: undefined });

      await provider.createAccount(params);

      expect(stalwart.createPrincipal).toHaveBeenCalledWith(
        expect.objectContaining({ quota: 0 }),
      );
    });
  });

  describe('deleteAccount', () => {
    it('when called, then delegates to stalwart service', async () => {
      await provider.deleteAccount('user@example.com');

      expect(stalwart.deletePrincipal).toHaveBeenCalledWith('user@example.com');
    });
  });

  describe('getAccount', () => {
    it('when principal exists, then returns account info', async () => {
      stalwart.getPrincipal.mockResolvedValue({
        name: 'user@example.com',
        type: 'individual',
        description: 'User Name',
        emails: ['user@example.com', 'alias@example.com'],
        quota: 5_000_000,
      });

      const result = await provider.getAccount('user@example.com');

      expect(result).toEqual({
        name: 'user@example.com',
        displayName: 'User Name',
        emails: ['user@example.com', 'alias@example.com'],
        quota: 5_000_000,
      });
    });

    it('when principal does not exist, then returns null', async () => {
      stalwart.getPrincipal.mockResolvedValue(null);

      const result = await provider.getAccount('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('when principal has no optional fields, then uses defaults', async () => {
      stalwart.getPrincipal.mockResolvedValue({
        name: 'user@example.com',
        type: 'individual',
      });

      const result = await provider.getAccount('user@example.com');

      expect(result).toEqual({
        name: 'user@example.com',
        displayName: '',
        emails: [],
        quota: 0,
      });
    });
  });

  describe('addAddress', () => {
    it('when called, then patches principal with addItem action', async () => {
      await provider.addAddress('user@example.com', 'alias@example.com');

      expect(stalwart.patchPrincipal).toHaveBeenCalledWith('user@example.com', [
        { action: 'addItem', field: 'emails', value: 'alias@example.com' },
      ]);
    });
  });

  describe('removeAddress', () => {
    it('when called, then patches principal with removeItem action', async () => {
      await provider.removeAddress('user@example.com', 'alias@example.com');

      expect(stalwart.patchPrincipal).toHaveBeenCalledWith('user@example.com', [
        {
          action: 'removeItem',
          field: 'emails',
          value: 'alias@example.com',
        },
      ]);
    });
  });

  describe('setPrimaryAddress', () => {
    it('when account exists, then recreates with new name and reordered emails', async () => {
      const existingPrincipal = {
        name: 'old@example.com',
        type: 'individual',
        description: 'User',
        secrets: ['pass'],
        emails: ['old@example.com', 'new@example.com', 'other@example.com'],
        quota: 1000,
      };
      stalwart.getPrincipal.mockResolvedValue(existingPrincipal);

      await provider.setPrimaryAddress('old@example.com', 'new@example.com');

      expect(stalwart.deletePrincipal).toHaveBeenCalledWith('old@example.com');
      expect(stalwart.createPrincipal).toHaveBeenCalledWith({
        ...existingPrincipal,
        name: 'new@example.com',
        emails: ['new@example.com', 'old@example.com', 'other@example.com'],
      });
    });

    it('when account does not exist, then throws error', async () => {
      stalwart.getPrincipal.mockResolvedValue(null);

      await expect(
        provider.setPrimaryAddress(
          'nonexistent@example.com',
          'new@example.com',
        ),
      ).rejects.toThrow("Account 'nonexistent@example.com' not found");
    });
  });
});
