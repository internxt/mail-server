import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountService } from './account.service.js';
import { AccountProvider } from './account-provider.port.js';
import { MailAccount, MailAccountState } from './domain/mail-account.domain.js';
import { MailDomain } from './domain/mail-domain.domain.js';
import { MailAddress } from './domain/mail-address.domain.js';
import { AccountRepository } from './repositories/account.repository.js';
import { AddressRepository } from './repositories/address.repository.js';
import { DomainRepository } from './repositories/domain.repository.js';
import { MailAddressKeysRepository } from './repositories/mail-address-keys.repository.js';
import {
  newMailAccountAttributes,
  newMailAddressKeyBundle,
  newMailAddressAttributes,
  newMailAddressKeysAttributes,
  newMailDomainAttributes,
} from '../../../test/fixtures.js';
import { MailAddressKeys } from './domain/mail-address-keys.domain.js';
import { MailNotSetupException } from '../provisioning/mail-not-setup.exception.js';

describe('AccountService', () => {
  let service: AccountService;
  let provider: DeepMocked<AccountProvider>;
  let accounts: DeepMocked<AccountRepository>;
  let addresses: DeepMocked<AddressRepository>;
  let domains: DeepMocked<DomainRepository>;
  let keys: DeepMocked<MailAddressKeysRepository>;
  let config: DeepMocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountService],
    })
      .useMocker(() => createMock<object>())
      .compile();

    service = module.get(AccountService);
    provider = module.get(AccountProvider);
    accounts = module.get(AccountRepository);
    addresses = module.get(AddressRepository);
    domains = module.get(DomainRepository);
    keys = module.get(MailAddressKeysRepository);
    config = module.get(ConfigService);
  });

  describe('getAccount', () => {
    it('when account exists, then returns it', async () => {
      const attrs = newMailAccountAttributes();
      const account = MailAccount.build(attrs);
      accounts.findByUserId.mockResolvedValue(account);

      const result = await service.getAccount(attrs.userId);

      expect(accounts.findByUserId).toHaveBeenCalledWith(attrs.userId);
      expect(result).toBe(account);
    });

    it('when account does not exist, then throws NotFoundException', async () => {
      accounts.findByUserId.mockResolvedValue(null);

      await expect(service.getAccount('unknown-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAccountStatus', () => {
    it('when account is active, then returns status with null suspendedAt and deletionAt', async () => {
      const attrs = newMailAccountAttributes();
      accounts.findByUserId.mockResolvedValue(MailAccount.build(attrs));

      const result = await service.getAccountStatus(attrs.userId);

      expect(result).toEqual({
        id: attrs.id,
        defaultAddress: attrs.addresses[0]?.address ?? null,
        status: MailAccountState.Active,
        suspendedAt: null,
        deletionAt: null,
      });
    });

    it('when account is suspended, then computes deletionAt from retention config', async () => {
      const suspendedAt = new Date('2026-01-01T00:00:00.000Z');
      const attrs = newMailAccountAttributes({
        status: MailAccountState.Suspended,
        suspendedAt,
      });
      accounts.findByUserId.mockResolvedValue(MailAccount.build(attrs));
      config.get.mockReturnValue(30);

      const result = await service.getAccountStatus(attrs.userId);

      expect(config.get).toHaveBeenCalledWith(
        'accounts.suspendedRetentionDays',
      );
      expect(result.status).toBe(MailAccountState.Suspended);
      expect(result.suspendedAt).toEqual(suspendedAt);
      expect(result.deletionAt).toEqual(new Date('2026-01-31T00:00:00.000Z'));
    });

    it('when account does not exist, then throws NotFoundException', async () => {
      accounts.findByUserId.mockResolvedValue(null);

      await expect(service.getAccountStatus('unknown-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findUserIdByAddress', () => {
    it('when address exists, then returns the userId', async () => {
      const userId = 'user-uuid-1';
      addresses.findUserIdByAddress.mockResolvedValue(userId);

      const result = await service.findUserIdByAddress('alice@internxt.com');

      expect(addresses.findUserIdByAddress).toHaveBeenCalledWith(
        'alice@internxt.com',
      );
      expect(result).toBe(userId);
    });

    it('when address does not exist, then returns null', async () => {
      addresses.findUserIdByAddress.mockResolvedValue(null);

      const result = await service.findUserIdByAddress('unknown@internxt.com');

      expect(result).toBeNull();
    });
  });

  describe('getAddressKeys', () => {
    it('when address belongs to user, then returns the key bundle', async () => {
      const addr = newMailAddressAttributes();
      const account = MailAccount.build(
        newMailAccountAttributes({ addresses: [addr] }),
      );
      const keysAttrs = newMailAddressKeysAttributes({
        mailAddressId: addr.id,
      });
      accounts.findByUserId.mockResolvedValue(account);
      keys.findByAddressId.mockResolvedValue(MailAddressKeys.build(keysAttrs));

      const result = await service.getAddressKeys(account.userId, addr.address);

      expect(keys.findByAddressId).toHaveBeenCalledWith(addr.id);
      expect(result).toStrictEqual({
        address: addr.address,
        publicKey: keysAttrs.publicKey,
        encryptionPrivateKey: keysAttrs.encryptionPrivateKey,
        recoveryPrivateKey: keysAttrs.recoveryPrivateKey,
      });
    });

    it('when account does not exist, then throws MailNotSetupException', async () => {
      accounts.findByUserId.mockResolvedValue(null);

      await expect(
        service.getAddressKeys('unknown', 'a@b.com'),
      ).rejects.toThrow(MailNotSetupException);
    });

    it('when account has no addresses, then throws MailNotSetupException', async () => {
      const account = MailAccount.build(
        newMailAccountAttributes({ addresses: [] }),
      );
      accounts.findByUserId.mockResolvedValue(account);

      await expect(
        service.getAddressKeys(account.userId, 'a@b.com'),
      ).rejects.toThrow(MailNotSetupException);
    });

    it('when address is not on the account, then throws NotFoundException', async () => {
      const account = MailAccount.build(newMailAccountAttributes());
      accounts.findByUserId.mockResolvedValue(account);

      await expect(
        service.getAddressKeys(account.userId, 'someone-else@example.com'),
      ).rejects.toThrow(NotFoundException);
      expect(keys.findByAddressId).not.toHaveBeenCalled();
    });

    it('when keys are missing for the address, then throws NotFoundException', async () => {
      const addr = newMailAddressAttributes();
      const account = MailAccount.build(
        newMailAccountAttributes({ addresses: [addr] }),
      );
      accounts.findByUserId.mockResolvedValue(account);
      keys.findByAddressId.mockResolvedValue(null);

      await expect(
        service.getAddressKeys(account.userId, addr.address),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAccount', () => {
    it('when account exists, then returns it', async () => {
      const account = MailAccount.build(newMailAccountAttributes());
      accounts.findByUserId.mockResolvedValue(account);

      const result = await service.findAccount(account.userId);

      expect(result).toBe(account);
    });

    it('when account does not exist, then returns null', async () => {
      accounts.findByUserId.mockResolvedValue(null);

      const result = await service.findAccount('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('provisionAccount', () => {
    const domainAttrs = newMailDomainAttributes({ domain: 'internxt.com' });
    const domain = MailDomain.build(domainAttrs);
    const params = {
      userId: 'user-uuid-1',
      address: 'alice@internxt.com',
      domain: 'internxt.com',
      displayName: 'Alice Smith',
      keys: newMailAddressKeyBundle(),
    };

    it('when all inputs are valid, then creates account, address, provider link, and stalwart principal', async () => {
      const createdAccount = MailAccount.build(
        newMailAccountAttributes({
          userId: params.userId,
          addresses: [],
        }),
      );
      const createdAddressId = 'new-address-id';
      const provisionedAccount = MailAccount.build(
        newMailAccountAttributes({
          id: createdAccount.id,
          userId: params.userId,
          addresses: [
            newMailAddressAttributes({
              mailAccountId: createdAccount.id,
              address: params.address,
              domainId: domain.id,
              isDefault: true,
              providerExternalId: params.address,
            }),
          ],
        }),
      );

      domains.findByDomain.mockResolvedValue(domain);
      addresses.findByAddress.mockResolvedValue(null);
      accounts.findByUserId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(provisionedAccount);
      accounts.create.mockResolvedValue(createdAccount);
      addresses.create.mockResolvedValue(createdAddressId);

      const result = await service.provisionAccount(params);

      expect(result.userId).toBe(params.userId);
      expect(accounts.create).toHaveBeenCalledWith({
        userId: params.userId,
      });
      expect(addresses.create).toHaveBeenCalledWith({
        mailAccountId: createdAccount.id,
        address: params.address,
        domainId: domain.id,
        isDefault: true,
      });
      expect(addresses.createProviderLink).toHaveBeenCalledWith({
        mailAddressId: createdAddressId,
        provider: 'stalwart',
        externalId: params.address,
      });
      expect(provider.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: createdAccount.id,
          primaryAddress: params.address,
          displayName: params.displayName,
        }),
      );
      expect(keys.create).toHaveBeenCalledWith({
        mailAddressId: createdAddressId,
        ...params.keys,
      });
    });

    it('when domain does not exist, then throws NotFoundException', async () => {
      domains.findByDomain.mockResolvedValue(null);
      addresses.findByAddress.mockResolvedValue(null);
      accounts.findByUserId.mockResolvedValue(null);

      await expect(service.provisionAccount(params)).rejects.toThrow(
        NotFoundException,
      );
      expect(accounts.create).not.toHaveBeenCalled();
    });

    it('when user already has a mail account, then throws ConflictException', async () => {
      const existingAccount = MailAccount.build(
        newMailAccountAttributes({ userId: params.userId }),
      );
      domains.findByDomain.mockResolvedValue(domain);
      addresses.findByAddress.mockResolvedValue(null);
      accounts.findByUserId.mockResolvedValue(existingAccount);

      await expect(service.provisionAccount(params)).rejects.toThrow(
        ConflictException,
      );
      expect(accounts.create).not.toHaveBeenCalled();
    });

    it('when address is already taken, then throws ConflictException', async () => {
      domains.findByDomain.mockResolvedValue(domain);
      addresses.findByAddress.mockResolvedValue(
        MailAddress.build(
          newMailAddressAttributes({ address: params.address }),
        ),
      );
      accounts.findByUserId.mockResolvedValue(null);

      await expect(service.provisionAccount(params)).rejects.toThrow(
        ConflictException,
      );
      expect(accounts.create).not.toHaveBeenCalled();
    });

    it('when stalwart provider fails, then deletes the account (undo) and rethrows', async () => {
      const createdAccount = MailAccount.build(
        newMailAccountAttributes({
          userId: params.userId,
          addresses: [],
        }),
      );

      domains.findByDomain.mockResolvedValue(domain);
      addresses.findByAddress.mockResolvedValue(null);
      accounts.findByUserId.mockResolvedValue(null);
      accounts.create.mockResolvedValue(createdAccount);
      addresses.create.mockResolvedValue('addr-id');
      provider.createAccount.mockRejectedValue(new Error('Stalwart down'));

      await expect(service.provisionAccount(params)).rejects.toThrow(
        'Stalwart down',
      );
      expect(accounts.delete).toHaveBeenCalledWith(createdAccount.id);
    });

    it('when concurrent provisioning race occurs, then returns the existing account', async () => {
      const existingAccount = MailAccount.build(
        newMailAccountAttributes({ userId: params.userId }),
      );
      const uniqueError = new Error('Unique constraint violated');
      uniqueError.name = 'SequelizeUniqueConstraintError';

      domains.findByDomain.mockResolvedValue(domain);
      addresses.findByAddress.mockResolvedValue(null);
      accounts.findByUserId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingAccount);
      accounts.create.mockRejectedValue(uniqueError);

      const result = await service.provisionAccount(params);

      expect(result).toBe(existingAccount);
      expect(provider.createAccount).not.toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    it('when account has addresses, then deletes all principals and account', async () => {
      const addr1 = newMailAddressAttributes({ isDefault: true });
      const addr2 = newMailAddressAttributes({ isDefault: false });
      const account = MailAccount.build(
        newMailAccountAttributes({ addresses: [addr1, addr2] }),
      );
      accounts.findByUserId.mockResolvedValue(account);

      await service.deleteAccount(account.userId);

      expect(provider.deleteAccount).toHaveBeenCalledWith(
        addr1.providerExternalId,
      );
      expect(provider.deleteAccount).toHaveBeenCalledWith(
        addr2.providerExternalId,
      );
      expect(addresses.deleteProviderLink).toHaveBeenCalledWith(addr1.id);
      expect(addresses.deleteProviderLink).toHaveBeenCalledWith(addr2.id);
      expect(accounts.delete).toHaveBeenCalledWith(account.id);
    });

    it('when account does not exist, then throws NotFoundException', async () => {
      accounts.findByUserId.mockResolvedValue(null);

      await expect(service.deleteAccount('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addAddress', () => {
    it('when all conditions met, then creates principal and links provider', async () => {
      const accountAttrs = newMailAccountAttributes();
      const account = MailAccount.build(accountAttrs);
      const domainAttrs = newMailDomainAttributes();
      const domain = MailDomain.build(domainAttrs);
      const newAddr = 'new@example.com';
      const newAddressId = 'new-address-id';

      accounts.findByUserId.mockResolvedValue(account);
      domains.findByDomain.mockResolvedValue(domain);
      addresses.findByAddress.mockResolvedValue(null);
      addresses.create.mockResolvedValue(newAddressId);

      await service.addAddress(
        accountAttrs.userId,
        newAddr,
        domainAttrs.domain,
        'password123',
        'Display Name',
      );

      expect(addresses.create).toHaveBeenCalledWith({
        mailAccountId: account.id,
        address: newAddr,
        domainId: domain.id,
        isDefault: false,
      });
      expect(provider.createAccount).toHaveBeenCalledWith({
        accountId: newAddressId,
        primaryAddress: newAddr,
        displayName: 'Display Name',
        password: 'password123',
      });
      expect(addresses.createProviderLink).toHaveBeenCalledWith({
        mailAddressId: newAddressId,
        provider: 'stalwart',
        externalId: newAddr,
      });
    });

    it('when account not found, then throws NotFoundException', async () => {
      accounts.findByUserId.mockResolvedValue(null);
      domains.findByDomain.mockResolvedValue(
        MailDomain.build(newMailDomainAttributes()),
      );
      addresses.findByAddress.mockResolvedValue(null);

      await expect(
        service.addAddress('unknown', 'a@b.com', 'b.com', 'pass'),
      ).rejects.toThrow(NotFoundException);
    });

    it('when domain not found, then throws NotFoundException', async () => {
      const account = MailAccount.build(newMailAccountAttributes());
      accounts.findByUserId.mockResolvedValue(account);
      domains.findByDomain.mockResolvedValue(null);
      addresses.findByAddress.mockResolvedValue(null);

      await expect(
        service.addAddress(account.userId, 'a@b.com', 'unknown.com', 'pass'),
      ).rejects.toThrow(NotFoundException);
    });

    it('when address already exists, then throws ConflictException', async () => {
      const account = MailAccount.build(newMailAccountAttributes());
      const domain = MailDomain.build(newMailDomainAttributes());
      const existing = MailAddress.build(newMailAddressAttributes());

      accounts.findByUserId.mockResolvedValue(account);
      domains.findByDomain.mockResolvedValue(domain);
      addresses.findByAddress.mockResolvedValue(existing);

      await expect(
        service.addAddress(
          account.userId,
          existing.address,
          domain.domain,
          'pass',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('when provider fails, then rolls back the created address', async () => {
      const account = MailAccount.build(newMailAccountAttributes());
      const domain = MailDomain.build(newMailDomainAttributes());
      const newAddressId = 'new-address-id';

      accounts.findByUserId.mockResolvedValue(account);
      domains.findByDomain.mockResolvedValue(domain);
      addresses.findByAddress.mockResolvedValue(null);
      addresses.create.mockResolvedValue(newAddressId);
      provider.createAccount.mockRejectedValue(new Error('provider down'));

      await expect(
        service.addAddress(
          account.userId,
          'new@example.com',
          domain.domain,
          'pass',
        ),
      ).rejects.toThrow('provider down');

      expect(addresses.delete).toHaveBeenCalledWith(newAddressId);
      expect(addresses.createProviderLink).not.toHaveBeenCalled();
    });
  });

  describe('removeAddress', () => {
    it('when address exists and is not default, then deletes principal and address', async () => {
      const nonDefaultAddr = newMailAddressAttributes({ isDefault: false });
      const account = MailAccount.build(
        newMailAccountAttributes({
          addresses: [
            newMailAddressAttributes({ isDefault: true }),
            nonDefaultAddr,
          ],
        }),
      );
      accounts.findByUserId.mockResolvedValue(account);

      await service.removeAddress(account.userId, nonDefaultAddr.address);

      expect(provider.deleteAccount).toHaveBeenCalledWith(
        nonDefaultAddr.providerExternalId,
      );
      expect(addresses.deleteProviderLink).toHaveBeenCalledWith(
        nonDefaultAddr.id,
      );
      expect(addresses.delete).toHaveBeenCalledWith(nonDefaultAddr.id);
    });

    it('when address is default, then throws UnprocessableEntityException', async () => {
      const defaultAddr = newMailAddressAttributes({ isDefault: true });
      const account = MailAccount.build(
        newMailAccountAttributes({ addresses: [defaultAddr] }),
      );
      accounts.findByUserId.mockResolvedValue(account);

      await expect(
        service.removeAddress(account.userId, defaultAddr.address),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('when address not found for account, then throws NotFoundException', async () => {
      const account = MailAccount.build(newMailAccountAttributes());
      accounts.findByUserId.mockResolvedValue(account);

      await expect(
        service.removeAddress(account.userId, 'nonexistent@mail.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('when account not found, then throws NotFoundException', async () => {
      accounts.findByUserId.mockResolvedValue(null);

      await expect(service.removeAddress('unknown', 'a@b.com')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('checkAddressAvailability', () => {
    const taken = [
      'username@domain',
      'username@domain1',
      'username@domain2',
      ...Array.from({ length: 20 }, (_, i) => `username${i + 1}@domain`),
    ];

    beforeEach(() => {
      addresses.findByAddresses.mockResolvedValue(new Set([]));
      domains.findAllActive.mockResolvedValue([
        newMailDomainAttributes({ domain: 'domain' }),
        newMailDomainAttributes({ domain: 'domain1' }),
        newMailDomainAttributes({ domain: 'domain2' }),
      ]);
    });

    it('when domain is available and address is not taken, return is available', async () => {
      const res = await service.checkAddressAvailability('username', 'domain');

      expect(res).toStrictEqual({ available: true, suggestion: null });

      expect(addresses.findByAddresses).toHaveBeenCalledExactlyOnceWith(taken);
    });

    it('when domain is not available, return is not available and suggestion', async () => {
      domains.findAllActive.mockResolvedValue([
        newMailDomainAttributes({ domain: 'domain1' }),
        newMailDomainAttributes({ domain: 'domain2' }),
      ]);

      const res = await service.checkAddressAvailability('username', 'domain');

      expect(res).toStrictEqual({
        available: false,
        suggestion: 'username@domain1',
      });
      expect(addresses.findByAddresses).toHaveBeenCalledExactlyOnceWith([
        'username@domain1',
        'username@domain2',
      ]);
    });

    it('when address is taken, return is not available and suggestion', async () => {
      addresses.findByAddresses.mockResolvedValue(new Set(['username@domain']));

      const res = await service.checkAddressAvailability('username', 'domain');

      expect(res).toStrictEqual({
        available: false,
        suggestion: 'username@domain1',
      });
      expect(addresses.findByAddresses).toHaveBeenCalledExactlyOnceWith(taken);
    });

    it('when all suggestions are taken, return is not available and no suggestion', async () => {
      addresses.findByAddresses.mockResolvedValue(new Set(taken));

      const res = await service.checkAddressAvailability('username', 'domain');

      expect(res).toStrictEqual({ available: false, suggestion: null });
      expect(addresses.findByAddresses).toHaveBeenCalledExactlyOnceWith(taken);
    });
  });

  describe('setPrimaryAddress', () => {
    it('when address exists and is not default, then sets it as primary', async () => {
      const defaultAddr = newMailAddressAttributes({ isDefault: true });
      const otherAddr = newMailAddressAttributes({ isDefault: false });
      const account = MailAccount.build(
        newMailAccountAttributes({
          addresses: [defaultAddr, otherAddr],
        }),
      );
      accounts.findByUserId.mockResolvedValue(account);

      await service.setPrimaryAddress(account.userId, otherAddr.address);

      expect(addresses.setDefault).toHaveBeenCalledWith(
        otherAddr.id,
        account.id,
      );
    });

    it('when address is already default, then does nothing', async () => {
      const defaultAddr = newMailAddressAttributes({ isDefault: true });
      const account = MailAccount.build(
        newMailAccountAttributes({ addresses: [defaultAddr] }),
      );
      accounts.findByUserId.mockResolvedValue(account);

      await service.setPrimaryAddress(account.userId, defaultAddr.address);

      expect(addresses.setDefault).not.toHaveBeenCalled();
    });

    it('when address not found for account, then throws NotFoundException', async () => {
      const account = MailAccount.build(newMailAccountAttributes());
      accounts.findByUserId.mockResolvedValue(account);

      await expect(
        service.setPrimaryAddress(account.userId, 'nonexistent@mail.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('when account not found, then throws NotFoundException', async () => {
      accounts.findByUserId.mockResolvedValue(null);

      await expect(
        service.setPrimaryAddress('unknown', 'a@b.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
