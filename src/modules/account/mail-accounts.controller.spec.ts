import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { MailAccountsController } from './mail-accounts.controller.js';
import { AccountService } from './account.service.js';
import { PaymentsService } from '../infrastructure/payments/payments.service.js';
import { DriveGatewayClient } from '../infrastructure/drive/drive-gateway.client.js';
import { MailAccount } from './domain/mail-account.domain.js';
import {
  newMailAccountAttributes,
  newMailAddressKeyBundle,
  newUserPayload,
} from '../../../test/fixtures.js';
import type { CreateMailAccountDto } from './dto/create-mail-account.dto.js';
import type { Tier } from '../infrastructure/payments/payments.types.js';

const tierWith = (mailEnabled: boolean): Tier => ({
  id: 't1',
  label: 'pro',
  productId: 'p1',
  billingType: 'monthly',
  featuresPerService: {
    mail: { enabled: mailEnabled, addressesPerUser: 3 },
  },
});

describe('MailAccountsController', () => {
  let controller: MailAccountsController;
  let accountService: DeepMocked<AccountService>;
  let payments: DeepMocked<PaymentsService>;
  let driveGateway: DeepMocked<DriveGatewayClient>;

  const buildDto = (): CreateMailAccountDto => ({
    address: 'alice',
    domain: 'inxt.eu',
    displayName: 'Alice Smith',
    encryptedPassword: 'encrypted',
    keys: newMailAddressKeyBundle(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MailAccountsController],
    })
      .useMocker(() => createMock<object>())
      .compile();

    controller = module.get(MailAccountsController);
    accountService = module.get(AccountService);
    payments = module.get(PaymentsService);
    driveGateway = module.get(DriveGatewayClient);
  });

  describe('createMailAccount', () => {
    it('when tier disables mail, then throws ForbiddenException', async () => {
      const user = newUserPayload();
      payments.getUserTier.mockResolvedValue(tierWith(false));

      await expect(
        controller.createMailAccount(user, buildDto()),
      ).rejects.toThrow(ForbiddenException);
      expect(driveGateway.verifyPassword).not.toHaveBeenCalled();
      expect(accountService.provisionAccount).not.toHaveBeenCalled();
    });

    it('when drive rejects password, then propagates UnauthorizedException', async () => {
      const user = newUserPayload();
      payments.getUserTier.mockResolvedValue(tierWith(true));
      driveGateway.verifyPassword.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      await expect(
        controller.createMailAccount(user, buildDto()),
      ).rejects.toThrow(UnauthorizedException);
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

      expect(driveGateway.verifyPassword).toHaveBeenCalledWith(
        user.uuid,
        dto.encryptedPassword,
      );
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
