import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { NotFoundException } from '@nestjs/common';
import { GatewayController } from './gateway.controller.js';
import { AccountService } from '../account/account.service.js';
import { MailAccount } from '../account/domain/mail-account.domain.js';
import { MailDomain } from '../account/domain/mail-domain.domain.js';
import {
  newMailAccountAttributes,
  newMailAddressAttributes,
  newMailDomainAttributes,
} from '../../../test/fixtures.js';
import { v4 } from 'uuid';

describe('GatewayController', () => {
  let controller: GatewayController;
  let accountService: DeepMocked<AccountService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GatewayController],
    })
      .useMocker(() => createMock<object>())
      .compile();

    controller = module.get(GatewayController);
    accountService = module.get(AccountService);
  });

  describe('provisionAccount', () => {
    it('when valid request, then provisions account and returns id and address', async () => {
      const dto = {
        userId: v4(),
        address: 'alice@internxt.com',
        domain: 'internxt.com',
        displayName: 'Alice Smith',
      };
      const account = MailAccount.build(
        newMailAccountAttributes({
          userId: dto.userId,
          addresses: [
            newMailAddressAttributes({
              address: dto.address,
              isDefault: true,
            }),
          ],
        }),
      );

      accountService.provisionAccount.mockResolvedValue(account);

      const result = await controller.provisionAccount(dto);

      expect(accountService.provisionAccount).toHaveBeenCalledWith({
        userId: dto.userId,
        address: dto.address,
        domain: dto.domain,
        displayName: dto.displayName,
      });
      expect(result).toEqual({
        id: account.id,
        userId: account.userId,
        address: dto.address,
      });
    });
  });

  describe('getAddress', () => {
    it('when address is found, then returns address and userId', async () => {
      const userId = v4();
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

  describe('listDomains', () => {
    it('when active domains exist, then returns them', async () => {
      const domainList = [
        MailDomain.build(newMailDomainAttributes({ domain: 'internxt.com' })),
        MailDomain.build(newMailDomainAttributes({ domain: 'internxt.me' })),
      ];
      accountService.listActiveDomains.mockResolvedValue(domainList);

      const result = await controller.listDomains();

      expect(result).toEqual([
        { domain: 'internxt.com' },
        { domain: 'internxt.me' },
      ]);
    });

    it('when no active domains, then returns empty array', async () => {
      accountService.listActiveDomains.mockResolvedValue([]);

      const result = await controller.listDomains();

      expect(result).toEqual([]);
    });
  });
});
