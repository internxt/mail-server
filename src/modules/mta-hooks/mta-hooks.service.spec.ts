import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { AccountService } from '../account/account.service.js';
import { EmailService } from '../email/email.service.js';
import { BridgeClient } from '../infrastructure/bridge/bridge.service.js';
import { MtaHooksService } from './mta-hooks.service.js';
import type { MtaHookRequest } from './mta-hooks.types.js';

describe('MtaHooksService', () => {
  let service: MtaHooksService;
  let accountService: DeepMocked<AccountService>;
  let emailService: DeepMocked<EmailService>;
  let bridgeClient: DeepMocked<BridgeClient>;

  const buildRequest = (
    to: string[],
    opts: { size?: number } = {},
  ): MtaHookRequest => ({
    context: { stage: 'data' },
    envelope: {
      from: { address: 'sender@external.com' },
      to: to.map((address) => ({ address })),
    },
    message: opts.size !== undefined ? { size: opts.size } : undefined,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MtaHooksService],
    })
      .useMocker(() => createMock<object>())
      .compile();

    service = module.get(MtaHooksService);
    accountService = module.get(AccountService);
    emailService = module.get(EmailService);
    bridgeClient = module.get(BridgeClient);
  });

  describe('handleData', () => {
    it('when the recipient stays within quota, then accepts', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      emailService.getQuota.mockResolvedValue({ used: 1000, limit: 5000 });
      bridgeClient.reportMailUsage.mockResolvedValue({
        driveUsed: 2000,
        planQuota: 5000,
      });

      const result = await service.handleData(
        buildRequest(['jane@inxt.com'], { size: 500 }),
      );

      expect(result).toStrictEqual({ action: 'accept' });
      expect(accountService.findUserIdByAddress).toHaveBeenCalledWith(
        'jane@inxt.com',
      );
      expect(bridgeClient.reportMailUsage).toHaveBeenCalledWith('user-1', 1000);
    });

    it('when the message size pushes the recipient over quota, then rejects with 452 4.2.2', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      emailService.getQuota.mockResolvedValue({ used: 1000, limit: 5000 });
      bridgeClient.reportMailUsage.mockResolvedValue({
        driveUsed: 3800,
        planQuota: 5000,
      });

      const result = await service.handleData(
        buildRequest(['jane@inxt.com'], { size: 500 }),
      );

      expect(result).toStrictEqual({
        action: 'reject',
        response: {
          status: 452,
          enhancedStatus: '4.2.2',
          message: 'Recipient mailbox is over quota',
        },
      });
    });

    it('when projected usage exactly equals the quota, then accepts', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      emailService.getQuota.mockResolvedValue({ used: 1000, limit: 5000 });
      bridgeClient.reportMailUsage.mockResolvedValue({
        driveUsed: 3500,
        planQuota: 5000,
      });

      const result = await service.handleData(
        buildRequest(['jane@inxt.com'], { size: 500 }),
      );

      expect(result).toStrictEqual({ action: 'accept' });
    });

    it('when the message has no size, then the incoming bytes are not counted', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      emailService.getQuota.mockResolvedValue({ used: 1000, limit: 5000 });
      bridgeClient.reportMailUsage.mockResolvedValue({
        driveUsed: 3800,
        planQuota: 5000,
      });

      // Without a size the projected usage is 3800 + 1000 = 4800 <= 5000.
      const result = await service.handleData(buildRequest(['jane@inxt.com']));

      expect(result).toStrictEqual({ action: 'accept' });
    });

    it('when the address resolves to no internxt user, then skips it and accepts', async () => {
      accountService.findUserIdByAddress.mockResolvedValue(null);

      const result = await service.handleData(
        buildRequest(['external@gmail.com'], { size: 500 }),
      );

      expect(result).toStrictEqual({ action: 'accept' });
      expect(emailService.getQuota).not.toHaveBeenCalled();
      expect(bridgeClient.reportMailUsage).not.toHaveBeenCalled();
    });

    it('when the recipient address is upper-cased, then it is lowercased before resolution', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      emailService.getQuota.mockResolvedValue({ used: 0, limit: 5000 });
      bridgeClient.reportMailUsage.mockResolvedValue({
        driveUsed: 0,
        planQuota: 5000,
      });

      await service.handleData(buildRequest(['Jane@INXT.com'], { size: 10 }));

      expect(accountService.findUserIdByAddress).toHaveBeenCalledWith(
        'jane@inxt.com',
      );
      expect(emailService.getQuota).toHaveBeenCalledWith('jane@inxt.com');
    });

    it('when several recipients are present, then every recipient is evaluated', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      emailService.getQuota.mockResolvedValue({ used: 0, limit: 5000 });
      bridgeClient.reportMailUsage.mockResolvedValue({
        driveUsed: 0,
        planQuota: 5000,
      });

      await service.handleData(
        buildRequest(['first@inxt.com', 'second@inxt.com']),
      );

      expect(accountService.findUserIdByAddress).toHaveBeenCalledTimes(2);
      expect(accountService.findUserIdByAddress).toHaveBeenCalledWith(
        'first@inxt.com',
      );
      expect(accountService.findUserIdByAddress).toHaveBeenCalledWith(
        'second@inxt.com',
      );
    });

    it('when any recipient is over quota, then rejects the whole message', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      emailService.getQuota.mockResolvedValue({ used: 1000, limit: 5000 });
      bridgeClient.reportMailUsage
        .mockResolvedValueOnce({ driveUsed: 0, planQuota: 5000 })
        .mockResolvedValueOnce({ driveUsed: 4500, planQuota: 5000 });

      const result = await service.handleData(
        buildRequest(['ok@inxt.com', 'over@inxt.com'], { size: 100 }),
      );

      expect(result.action).toBe('reject');
    });

    it('when quota lookup throws, then fails open and accepts', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      emailService.getQuota.mockRejectedValue(new Error('JMAP down'));

      const result = await service.handleData(buildRequest(['jane@inxt.com']));

      expect(result).toStrictEqual({ action: 'accept' });
    });

    it('when Bridge reporting throws, then fails open and accepts', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      emailService.getQuota.mockResolvedValue({ used: 1000, limit: 5000 });
      bridgeClient.reportMailUsage.mockRejectedValue(new Error('bridge down'));

      const result = await service.handleData(buildRequest(['jane@inxt.com']));

      expect(result).toStrictEqual({ action: 'accept' });
    });

    it('when the request carries no recipients, then accepts without lookups', async () => {
      const result = await service.handleData({
        context: { stage: 'data' },
      });

      expect(result).toStrictEqual({ action: 'accept' });
      expect(accountService.findUserIdByAddress).not.toHaveBeenCalled();
    });
  });
});
