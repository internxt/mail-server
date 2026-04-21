import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { AddressRepository } from './address.repository.js';
import { MailAccountModel } from '../models/mail-account.model.js';
import { MailAddressModel } from '../models/mail-address.model.js';

describe('AddressRepository', () => {
  let repository: AddressRepository;
  let addressModel: DeepMocked<typeof MailAddressModel>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AddressRepository],
    })
      .useMocker((token) => {
        if (token === getModelToken(MailAddressModel)) {
          return createMock<typeof MailAddressModel>();
        }
        return createMock<object>();
      })
      .compile();

    repository = module.get(AddressRepository);
    addressModel = module.get(getModelToken(MailAddressModel));
  });

  describe('findUserIdByAddress', () => {
    it('when address exists with linked account, then returns userId', async () => {
      const userId = 'user-uuid-1';
      const model = { account: { userId } } as unknown as MailAddressModel;
      addressModel.findOne.mockResolvedValue(model);

      const result = await repository.findUserIdByAddress('alice@internxt.com');

      expect(addressModel.findOne).toHaveBeenCalledWith({
        where: { address: 'alice@internxt.com' },
        include: [{ model: MailAccountModel }],
      });
      expect(result).toBe(userId);
    });

    it('when address does not exist, then returns null', async () => {
      addressModel.findOne.mockResolvedValue(null);

      const result = await repository.findUserIdByAddress(
        'unknown@internxt.com',
      );

      expect(result).toBeNull();
    });

    it('when address exists but has no linked account, then returns null', async () => {
      const model = { account: null } as unknown as MailAddressModel;
      addressModel.findOne.mockResolvedValue(model);

      const result = await repository.findUserIdByAddress('alice@internxt.com');

      expect(result).toBeNull();
    });
  });
});
