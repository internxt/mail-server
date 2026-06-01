import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { GatewayController } from './gateway.controller.js';
import { AccountService } from '../account/account.service.js';
import { EmailService } from '../email/email.service.js';
import { newMailQuota } from '../../../test/fixtures.js';

describe('GatewayController', () => {
  let controller: GatewayController;
  let accountService: DeepMocked<AccountService>;
  let emailService: DeepMocked<EmailService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GatewayController],
    })
      .useMocker(() => createMock<object>())
      .compile();

    controller = module.get(GatewayController);
    accountService = module.get(AccountService);
    emailService = module.get(EmailService);
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

  describe('getQuota', () => {
    it('when account exists, then returns quota usage', async () => {
      const uuid = randomUUID();
      const limit = 5368709120;
      const quota = newMailQuota({ used: 1024, limit });
      emailService.getQuotaByUuid.mockResolvedValue(quota);

      const result = await controller.getQuota(uuid);

      expect(emailService.getQuotaByUuid).toHaveBeenCalledWith(uuid);
      expect(result).toEqual(quota);
    });

    it('when account does not exist, then propagates NotFoundException', async () => {
      emailService.getQuotaByUuid.mockRejectedValue(new NotFoundException());

      await expect(controller.getQuota(randomUUID())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateQuota', () => {
    it('when account exists, then delegates to accountService', async () => {
      const uuid = randomUUID();
      const quotaBytes = 5368709120;
      accountService.updateQuota.mockResolvedValue(undefined);

      await controller.updateQuota(uuid, { quotaBytes });

      expect(accountService.updateQuota).toHaveBeenCalledWith(uuid, quotaBytes);
    });

    it('when account does not exist, then propagates NotFoundException', async () => {
      accountService.updateQuota.mockRejectedValue(new NotFoundException());

      await expect(
        controller.updateQuota(randomUUID(), { quotaBytes: 0 }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
