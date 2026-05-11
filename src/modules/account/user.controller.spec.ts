import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { ForbiddenException } from '@nestjs/common';
import { UserController } from './user.controller.js';
import { AccountService, type MailAccountStatus } from './account.service.js';
import { MailAccountState, MailAccount } from './domain/mail-account.domain.js';
import { PaymentsService } from '../infrastructure/payments/payments.service.js';
import {
  newMailAccountAttributes,
  newMailAddressKeyBundle,
  newUserPayload,
} from '../../../test/fixtures.js';
import type { CreateMailAccountDto } from './dto/create-mail-account.dto.js';
import type { Tier } from '../infrastructure/payments/payments.types.js';

const tierWith = (mailEnabled: boolean): Tier => ({
  id: 't1',
  label: 'ultimate',
  productId: 'p1',
  billingType: 'monthly',
  featuresPerService: {
    mail: { enabled: mailEnabled, addressesPerUser: 3 },
  },
});

describe('UserController', () => {
  let controller: UserController;
  let accountService: DeepMocked<AccountService>;
  let payments: DeepMocked<PaymentsService>;

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
    payments = module.get(PaymentsService);
  });

  describe('getMailAccount', () => {
    it('when called, then delegates to accountService.getAccountStatus', async () => {
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
    it('when tier disables mail, then throws ForbiddenException', async () => {
      const user = newUserPayload();
      payments.getUserTier.mockResolvedValue(tierWith(false));

      await expect(
        controller.createMailAccount(user, buildDto()),
      ).rejects.toThrow(ForbiddenException);
      expect(accountService.provisionAccount).not.toHaveBeenCalled();
    });

    it('when all checks pass, then provisions and returns address', async () => {
      const user = newUserPayload();
      const dto = buildDto();
      const account = MailAccount.build(
        newMailAccountAttributes({ userId: user.uuid }),
      );
      payments.getUserTier.mockResolvedValue(tierWith(true));
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
