import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { AddressesController } from './addresses.controller.js';
import { AccountService } from '../account/account.service.js';
import { newUserPayload } from '../../../test/fixtures.js';

describe('AddressesController', () => {
  let controller: AddressesController;
  let accountService: DeepMocked<AccountService>;
  const user = newUserPayload();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AddressesController],
    })
      .useMocker(() => createMock<object>())
      .compile();

    controller = module.get(AddressesController);
    accountService = module.get(AccountService);
  });

  describe('checkAvailability', () => {
    it('when address does not exist, return is available and no suggestion', async () => {
      accountService.checkAddressAvailability.mockResolvedValue({
        available: true,
        suggestion: null,
      });

      const result = await controller.checkAvailability(user, {
        username: 'alice',
        domain: 'inxt.me',
      });

      expect(accountService.checkAddressAvailability).toHaveBeenCalledWith(
        'alice',
        'inxt.me',
        user.uuid,
      );
      expect(result).toStrictEqual({
        available: true,
        suggestion: null,
      });
    });
  });

  it('when address does exist, return is not available and a suggestion', async () => {
    accountService.checkAddressAvailability.mockResolvedValue({
      available: false,
      suggestion: 'alice1@inxt.me',
    });

    const result = await controller.checkAvailability(user, {
      username: 'alice',
      domain: 'inxt.me',
    });

    expect(accountService.checkAddressAvailability).toHaveBeenCalledWith(
      'alice',
      'inxt.me',
      user.uuid,
    );
    expect(result).toStrictEqual({
      available: false,
      suggestion: 'alice1@inxt.me',
    });
  });
});
