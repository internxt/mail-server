import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { UserController } from './user.controller.js';
import { AccountService, type MailAccountStatus } from './account.service.js';
import { MailAccountState, MailAccount } from './domain/mail-account.domain.js';
import {
  newMailAccountAttributes,
  newMailAddressKeyBundle,
  newUserPayload,
} from '../../../test/fixtures.js';
import type { CreateMailAccountDto } from './dto/create-mail-account.dto.js';

describe('UserController', () => {
  let controller: UserController;
  let accountService: DeepMocked<AccountService>;

  const buildDto = (): CreateMailAccountDto => ({
    address: 'alice',
    domain: 'inxt.eu',
    displayName: 'Alice Smith',
    keys: newMailAddressKeyBundle(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
    })
      .useMocker(() => createMock<object>())
      .compile();

    controller = module.get(UserController);
    accountService = module.get(AccountService);
  });

  describe('getMailAccount', () => {
    it('when account is suspended, then returns suspendedAt and deletionAt from the service', async () => {
      const user = newUserPayload();
      const status: MailAccountStatus = {
        id: 'acc-1',
        defaultAddress: 'alice@inxt.eu',
        status: MailAccountState.Suspended,
        suspendedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletionAt: new Date('2026-01-31T00:00:00.000Z'),
      };
      accountService.getAccountStatus.mockResolvedValue(status);

      const result = await controller.getMailAccount(user);

      expect(accountService.getAccountStatus).toHaveBeenCalledWith(user.uuid);
      expect(result).toBe(status);
    });

    it('when account is active, then returns null suspendedAt and deletionAt', async () => {
      const user = newUserPayload();
      const status: MailAccountStatus = {
        id: 'acc-1',
        defaultAddress: 'alice@inxt.eu',
        status: MailAccountState.Active,
        suspendedAt: null,
        deletionAt: null,
      };
      accountService.getAccountStatus.mockResolvedValue(status);

      const result = await controller.getMailAccount(user);

      expect(accountService.getAccountStatus).toHaveBeenCalledWith(user.uuid);
      expect(result).toBe(status);
    });
  });

  describe('getMailAccountKeys', () => {
    it('when address query is omitted, then uses the caller`s default address', async () => {
      const user = newUserPayload();
      const defaultAddress = 'alice@inxt.eu';
      const bundle = { address: defaultAddress, ...newMailAddressKeyBundle() };
      accountService.getAddressKeys.mockResolvedValue(bundle);

      const result = await controller.getMailAccountKeys(
        user,
        defaultAddress,
        {},
      );

      expect(accountService.getAddressKeys).toHaveBeenCalledWith(
        user.uuid,
        defaultAddress,
      );
      expect(result).toBe(bundle);
    });

    it('when address query is provided, then uses the explicit address override', async () => {
      const user = newUserPayload();
      const defaultAddress = 'alice@inxt.eu';
      const overrideAddress = 'alias@inxt.eu';
      const bundle = {
        address: overrideAddress,
        ...newMailAddressKeyBundle(),
      };
      accountService.getAddressKeys.mockResolvedValue(bundle);

      const result = await controller.getMailAccountKeys(user, defaultAddress, {
        address: overrideAddress,
      });

      expect(accountService.getAddressKeys).toHaveBeenCalledWith(
        user.uuid,
        overrideAddress,
      );
      expect(result).toBe(bundle);
    });
  });

  describe('createMailAccount', () => {
    it('when provisioning succeeds, then returns the address', async () => {
      const user = newUserPayload();
      const dto = buildDto();
      const account = MailAccount.build(
        newMailAccountAttributes({ userId: user.uuid }),
      );
      accountService.provisionAccount.mockResolvedValue(account);

      const result = await controller.createMailAccount(user, dto);

      expect(accountService.provisionAccount).toHaveBeenCalledWith({
        userId: user.uuid,
        address: `${dto.address}@${dto.domain}`,
        domain: dto.domain,
        displayName: dto.displayName,
        keys: dto.keys,
      });
      expect(result.domain).toBe(dto.domain);
      expect(result.id).toBe(account.id);
    });
  });
});
