import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AccountService } from './account.service.js';
import { AccountProvider } from './account-provider.port.js';
import { MailAccount } from './domain/mail-account.domain.js';
import { MailDomain } from './domain/mail-domain.domain.js';
import { MailAddress } from './domain/mail-address.domain.js';
import { AccountRepository } from './repositories/account.repository.js';
import { AddressRepository } from './repositories/address.repository.js';
import { DomainRepository } from './repositories/domain.repository.js';
import {
  newMailAccountAttributes,
  newMailAddressAttributes,
  newMailDomainAttributes,
} from '../../../test/fixtures.js';

describe('AccountService', () => {
  let service: AccountService;
  let provider: DeepMocked<AccountProvider>;
  let accounts: DeepMocked<AccountRepository>;
  let addresses: DeepMocked<AddressRepository>;
  let domains: DeepMocked<DomainRepository>;

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
  });

  describe('getAccount', () => {
    it('when account exists, then returns it', async () => {
      const attrs = newMailAccountAttributes();
      const account = MailAccount.build(attrs);
      accounts.findByDriveUserUuid.mockResolvedValue(account);

      const result = await service.getAccount(attrs.driveUserUuid);

      expect(accounts.findByDriveUserUuid).toHaveBeenCalledWith(
        attrs.driveUserUuid,
      );
      expect(result).toBe(account);
    });

    it('when account does not exist, then throws NotFoundException', async () => {
      accounts.findByDriveUserUuid.mockResolvedValue(null);

      await expect(service.getAccount('unknown-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteAccount', () => {
    it('when account has a principal name, then deletes from provider and DB', async () => {
      const attrs = newMailAccountAttributes();
      const account = MailAccount.build(attrs);
      accounts.findByDriveUserUuid.mockResolvedValue(account);

      await service.deleteAccount(attrs.driveUserUuid);

      expect(provider.deleteAccount).toHaveBeenCalledWith(
        account.providerAccountId,
      );
      expect(accounts.delete).toHaveBeenCalledWith(account.id);
    });

    it('when account has no principal name, then only deletes from DB', async () => {
      const attrs = newMailAccountAttributes({
        addresses: [
          newMailAddressAttributes({
            isDefault: true,
            providerExternalId: null,
          }),
        ],
      });
      const account = MailAccount.build(attrs);
      accounts.findByDriveUserUuid.mockResolvedValue(account);

      await service.deleteAccount(attrs.driveUserUuid);

      expect(provider.deleteAccount).not.toHaveBeenCalled();
      expect(accounts.delete).toHaveBeenCalledWith(account.id);
    });

    it('when account does not exist, then throws NotFoundException', async () => {
      accounts.findByDriveUserUuid.mockResolvedValue(null);

      await expect(service.deleteAccount('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addAddress', () => {
    it('when all conditions met, then creates address and links provider', async () => {
      const accountAttrs = newMailAccountAttributes();
      const account = MailAccount.build(accountAttrs);
      const domainAttrs = newMailDomainAttributes();
      const domain = MailDomain.build(domainAttrs);
      const newAddr = 'new@example.com';
      const createdAddress = MailAddress.build(
        newMailAddressAttributes({ address: newAddr }),
      );

      accounts.findByDriveUserUuid.mockResolvedValue(account);
      domains.findByDomain.mockResolvedValue(domain);
      addresses.findByAddress.mockResolvedValue(null);
      addresses.create.mockResolvedValue(createdAddress);

      await service.addAddress(
        accountAttrs.driveUserUuid,
        newAddr,
        domainAttrs.domain,
      );

      expect(addresses.create).toHaveBeenCalledWith({
        mailAccountId: account.id,
        address: newAddr,
        domainId: domain.id,
        isDefault: false,
      });
      expect(provider.addAddress).toHaveBeenCalledWith(
        account.providerAccountId,
        newAddr,
      );
      expect(addresses.createProviderLink).toHaveBeenCalledWith({
        mailAddressId: createdAddress.id,
        provider: 'stalwart',
        externalId: account.providerAccountId,
      });
    });

    it('when account not found, then throws NotFoundException', async () => {
      accounts.findByDriveUserUuid.mockResolvedValue(null);
      domains.findByDomain.mockResolvedValue(
        MailDomain.build(newMailDomainAttributes()),
      );
      addresses.findByAddress.mockResolvedValue(null);

      await expect(
        service.addAddress('unknown', 'a@b.com', 'b.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('when domain not found, then throws NotFoundException', async () => {
      const account = MailAccount.build(newMailAccountAttributes());
      accounts.findByDriveUserUuid.mockResolvedValue(account);
      domains.findByDomain.mockResolvedValue(null);
      addresses.findByAddress.mockResolvedValue(null);

      await expect(
        service.addAddress(account.driveUserUuid, 'a@b.com', 'unknown.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('when address already exists, then throws ConflictException', async () => {
      const account = MailAccount.build(newMailAccountAttributes());
      const domain = MailDomain.build(newMailDomainAttributes());
      const existing = MailAddress.build(newMailAddressAttributes());

      accounts.findByDriveUserUuid.mockResolvedValue(account);
      domains.findByDomain.mockResolvedValue(domain);
      addresses.findByAddress.mockResolvedValue(existing);

      await expect(
        service.addAddress(
          account.driveUserUuid,
          existing.address,
          domain.domain,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('when provider fails, then rolls back the created address', async () => {
      const account = MailAccount.build(newMailAccountAttributes());
      const domain = MailDomain.build(newMailDomainAttributes());
      const createdAddress = MailAddress.build(
        newMailAddressAttributes({ address: 'new@example.com' }),
      );

      accounts.findByDriveUserUuid.mockResolvedValue(account);
      domains.findByDomain.mockResolvedValue(domain);
      addresses.findByAddress.mockResolvedValue(null);
      addresses.create.mockResolvedValue(createdAddress);
      provider.addAddress.mockRejectedValue(new Error('provider down'));

      await expect(
        service.addAddress(
          account.driveUserUuid,
          'new@example.com',
          domain.domain,
        ),
      ).rejects.toThrow('provider down');

      expect(addresses.delete).toHaveBeenCalledWith(createdAddress.id);
      expect(addresses.createProviderLink).not.toHaveBeenCalled();
    });

    it('when account has no principal name, then throws UnprocessableEntityException', async () => {
      const account = MailAccount.build(
        newMailAccountAttributes({
          addresses: [
            newMailAddressAttributes({
              isDefault: true,
              providerExternalId: null,
            }),
          ],
        }),
      );
      const domain = MailDomain.build(newMailDomainAttributes());

      accounts.findByDriveUserUuid.mockResolvedValue(account);
      domains.findByDomain.mockResolvedValue(domain);
      addresses.findByAddress.mockResolvedValue(null);

      await expect(
        service.addAddress(
          account.driveUserUuid,
          'new@example.com',
          domain.domain,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('removeAddress', () => {
    it('when address exists and is not default, then removes it', async () => {
      const nonDefaultAddr = newMailAddressAttributes({ isDefault: false });
      const account = MailAccount.build(
        newMailAccountAttributes({
          addresses: [
            newMailAddressAttributes({ isDefault: true }),
            nonDefaultAddr,
          ],
        }),
      );
      accounts.findByDriveUserUuid.mockResolvedValue(account);

      await service.removeAddress(
        account.driveUserUuid,
        nonDefaultAddr.address,
      );

      expect(provider.removeAddress).toHaveBeenCalledWith(
        account.providerAccountId,
        nonDefaultAddr.address,
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
      accounts.findByDriveUserUuid.mockResolvedValue(account);

      await expect(
        service.removeAddress(account.driveUserUuid, defaultAddr.address),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('when address not found for account, then throws NotFoundException', async () => {
      const account = MailAccount.build(newMailAccountAttributes());
      accounts.findByDriveUserUuid.mockResolvedValue(account);

      await expect(
        service.removeAddress(account.driveUserUuid, 'nonexistent@mail.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('when account not found, then throws NotFoundException', async () => {
      accounts.findByDriveUserUuid.mockResolvedValue(null);

      await expect(service.removeAddress('unknown', 'a@b.com')).rejects.toThrow(
        NotFoundException,
      );
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
      accounts.findByDriveUserUuid.mockResolvedValue(account);

      await service.setPrimaryAddress(account.driveUserUuid, otherAddr.address);

      expect(provider.setPrimaryAddress).toHaveBeenCalledWith(
        account.providerAccountId,
        otherAddr.address,
      );
      expect(addresses.setDefault).toHaveBeenCalledWith(
        otherAddr.id,
        account.id,
      );
      expect(addresses.updateAllProviderExternalIds).toHaveBeenCalledWith(
        account.id,
        otherAddr.address,
      );
    });

    it('when address is already default, then does nothing', async () => {
      const defaultAddr = newMailAddressAttributes({ isDefault: true });
      const account = MailAccount.build(
        newMailAccountAttributes({ addresses: [defaultAddr] }),
      );
      accounts.findByDriveUserUuid.mockResolvedValue(account);

      await service.setPrimaryAddress(
        account.driveUserUuid,
        defaultAddr.address,
      );

      expect(provider.setPrimaryAddress).not.toHaveBeenCalled();
      expect(addresses.setDefault).not.toHaveBeenCalled();
    });

    it('when address not found for account, then throws NotFoundException', async () => {
      const account = MailAccount.build(newMailAccountAttributes());
      accounts.findByDriveUserUuid.mockResolvedValue(account);

      await expect(
        service.setPrimaryAddress(
          account.driveUserUuid,
          'nonexistent@mail.com',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('when account not found, then throws NotFoundException', async () => {
      accounts.findByDriveUserUuid.mockResolvedValue(null);

      await expect(
        service.setPrimaryAddress('unknown', 'a@b.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
