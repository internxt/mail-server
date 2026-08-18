import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { GatewayController } from './gateway.controller.js';
import { AccountService } from '../account/account.service.js';
import { MailUsageService } from '../usage/mail-usage.service.js';

describe('GatewayController', () => {
  let controller: GatewayController;
  let accountService: DeepMocked<AccountService>;
  let mailUsageService: DeepMocked<MailUsageService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GatewayController],
    })
      .useMocker(() => createMock<object>())
      .compile();

    controller = module.get(GatewayController);
    accountService = module.get(AccountService);
    mailUsageService = module.get(MailUsageService);
  });

  describe('getAddress', () => {
    it('when address is found, then returns address and userId', async () => {
      const userId = randomUUID();
      accountService.findUserIdByAddress.mockResolvedValue(userId);

      const result = await controller.getAddress('Alice@Internxt.com');

      expect(accountService.findUserIdByAddress).toHaveBeenCalledWith(
        'alice@internxt.com',
      );
      expect(result).toEqual({ address: 'alice@internxt.com', userId });
    });

    it('when address is not found, then throws NotFoundException', async () => {
      accountService.findUserIdByAddress.mockResolvedValue(null);

      await expect(
        controller.getAddress('unknown@internxt.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAccountUsage', () => {
    it('when the user has mail stored, then returns the charged bytes', async () => {
      const uuid = randomUUID();
      mailUsageService.getChargedBytes.mockResolvedValue(4096);

      const result = await controller.getAccountUsage(uuid);

      expect(mailUsageService.getChargedBytes).toHaveBeenCalledWith(uuid);
      expect(result).toEqual({ userId: uuid, usage: 4096 });
    });

    it('when the user has no mail account, then returns zero instead of 404', async () => {
      const uuid = randomUUID();
      mailUsageService.getChargedBytes.mockResolvedValue(0);

      expect(await controller.getAccountUsage(uuid)).toEqual({
        userId: uuid,
        usage: 0,
      });
    });
  });

  describe('suspendAccount', () => {
    it('when called, then delegates to the account service', async () => {
      const uuid = randomUUID();

      await controller.suspendAccount(uuid);

      expect(accountService.suspendAccount).toHaveBeenCalledWith(uuid);
    });
  });

  describe('reactivateAccount', () => {
    it('when called, then delegates to the account service', async () => {
      const uuid = randomUUID();

      await controller.reactivateAccount(uuid);

      expect(accountService.reactivateAccount).toHaveBeenCalledWith(uuid);
    });
  });
});
