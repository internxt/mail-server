import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { AccountService } from '../account/account.service.js';
import { BridgeClient } from '../infrastructure/bridge/bridge.service.js';
import { MtaHooksService } from './mta-hooks.service.js';
import type { MtaHookRequest } from './mta-hooks.types.js';

describe('MtaHooksService', () => {
  let service: MtaHooksService;
  let accountService: DeepMocked<AccountService>;
  let bridgeClient: DeepMocked<BridgeClient>;

  const buildRequest = (
    to: string[],
    opts: { size?: number } = {},
  ): MtaHookRequest => ({
    context: { stage: 'rcpt' },
    envelope: {
      from: {
        address: 'sender@external.com',
        parameters:
          opts.size !== undefined ? { size: String(opts.size) } : undefined,
      },
      to: to.map((address) => ({ address })),
    },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MtaHooksService],
    })
      .useMocker(() => createMock<object>())
      .compile();

    service = module.get(MtaHooksService);
    accountService = module.get(AccountService);
    bridgeClient = module.get(BridgeClient);
  });

  describe('handleRcpt', () => {
    it('when the recipient stays within quota, then accepts', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      bridgeClient.getUserUsage.mockResolvedValue({
        maxSpaceBytes: 5000,
        totalUsedSpaceBytes: 2000,
      });

      const result = await service.handleRcpt(
        buildRequest(['jane@inxt.com'], { size: 500 }),
      );

      expect(result).toStrictEqual({ action: 'accept' });
      expect(accountService.findUserIdByAddress).toHaveBeenCalledWith(
        'jane@inxt.com',
      );
      expect(bridgeClient.getUserUsage).toHaveBeenCalledWith('user-1');
    });

    it('when the declared SIZE pushes the recipient over quota, then rejects with 452 4.2.2', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      bridgeClient.getUserUsage.mockResolvedValue({
        maxSpaceBytes: 5000,
        totalUsedSpaceBytes: 4800,
      });

      const result = await service.handleRcpt(
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
      bridgeClient.getUserUsage.mockResolvedValue({
        maxSpaceBytes: 5000,
        totalUsedSpaceBytes: 4500,
      });

      const result = await service.handleRcpt(
        buildRequest(['jane@inxt.com'], { size: 500 }),
      );

      expect(result).toStrictEqual({ action: 'accept' });
    });

    it('when no SIZE is declared but the mailbox is already over quota, then rejects', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      bridgeClient.getUserUsage.mockResolvedValue({
        maxSpaceBytes: 5000,
        totalUsedSpaceBytes: 5500,
      });

      const result = await service.handleRcpt(buildRequest(['jane@inxt.com']));

      expect(result.action).toBe('reject');
    });

    it('when the address resolves to no internxt user, then skips it and accepts', async () => {
      accountService.findUserIdByAddress.mockResolvedValue(null);

      const result = await service.handleRcpt(
        buildRequest(['external@gmail.com'], { size: 500 }),
      );

      expect(result).toStrictEqual({ action: 'accept' });
      expect(bridgeClient.getUserUsage).not.toHaveBeenCalled();
    });

    it('when the recipient address is upper-cased, then it is lowercased before resolution', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      bridgeClient.getUserUsage.mockResolvedValue({
        maxSpaceBytes: 5000,
        totalUsedSpaceBytes: 0,
      });

      await service.handleRcpt(buildRequest(['Jane@INXT.com'], { size: 10 }));

      expect(accountService.findUserIdByAddress).toHaveBeenCalledWith(
        'jane@inxt.com',
      );
    });

    it('when several recipients are present, then only the current (last) one is evaluated', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      bridgeClient.getUserUsage.mockResolvedValue({
        maxSpaceBytes: 5000,
        totalUsedSpaceBytes: 0,
      });

      await service.handleRcpt(
        buildRequest(['first@inxt.com', 'current@inxt.com']),
      );

      expect(accountService.findUserIdByAddress).toHaveBeenCalledTimes(1);
      expect(accountService.findUserIdByAddress).toHaveBeenCalledWith(
        'current@inxt.com',
      );
    });

    it('when recipient resolution throws, then fails open and accepts', async () => {
      accountService.findUserIdByAddress.mockRejectedValue(
        new Error('database down'),
      );

      const result = await service.handleRcpt(buildRequest(['jane@inxt.com']));

      expect(result).toStrictEqual({ action: 'accept' });
      expect(bridgeClient.getUserUsage).not.toHaveBeenCalled();
    });

    it('when the Bridge usage lookup throws, then fails open and accepts', async () => {
      accountService.findUserIdByAddress.mockResolvedValue('user-1');
      bridgeClient.getUserUsage.mockRejectedValue(new Error('bridge down'));

      const result = await service.handleRcpt(buildRequest(['jane@inxt.com']));

      expect(result).toStrictEqual({ action: 'accept' });
    });

    it('when the request carries no recipients, then accepts without lookups', async () => {
      const result = await service.handleRcpt({
        context: { stage: 'rcpt' },
      });

      expect(result).toStrictEqual({ action: 'accept' });
      expect(accountService.findUserIdByAddress).not.toHaveBeenCalled();
    });
  });
});
