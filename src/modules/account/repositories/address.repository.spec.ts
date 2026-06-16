import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Op } from 'sequelize';
import { AddressRepository } from './address.repository.js';
import { MailAccountModel } from '../models/mail-account.model.js';
import { MailAddressModel } from '../models/mail-address.model.js';
import { MailProviderAccountModel } from '../models/mail-provider-account.model.js';

describe('AddressRepository', () => {
  let repository: AddressRepository;
  let addressModel: DeepMocked<typeof MailAddressModel>;
  let providerAccountModel: DeepMocked<typeof MailProviderAccountModel>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AddressRepository],
    })
      .useMocker((token) => {
        if (token === getModelToken(MailAddressModel)) {
          return createMock<typeof MailAddressModel>();
        }
        if (token === getModelToken(MailProviderAccountModel)) {
          return createMock<typeof MailProviderAccountModel>();
        }
        return createMock<object>();
      })
      .compile();

    repository = module.get(AddressRepository);
    addressModel = module.get(getModelToken(MailAddressModel));
    providerAccountModel = module.get(getModelToken(MailProviderAccountModel));
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

  describe('findByAddresses', () => {
    it('when given more than 50 addresses, then throws without querying', async () => {
      const tooMany = Array.from({ length: 51 }, (_, i) => `a${i}@x.com`);

      await expect(repository.findByAddresses(tooMany)).rejects.toThrow(
        /exceeds max 50/,
      );
      expect(addressModel.findAll).not.toHaveBeenCalled();
    });
  });

  describe('findAddressIdsByAddresses', () => {
    it('when given an empty list, then returns an empty map without querying', async () => {
      const result = await repository.findAddressIdsByAddresses([]);

      expect(result).toEqual(new Map());
      expect(addressModel.findAll).not.toHaveBeenCalled();
    });

    it('when given more than 50 addresses, then throws without querying', async () => {
      const tooMany = Array.from({ length: 51 }, (_, i) => `a${i}@x.com`);

      await expect(
        repository.findAddressIdsByAddresses(tooMany),
      ).rejects.toThrow(/exceeds max 50/);
      expect(addressModel.findAll).not.toHaveBeenCalled();
    });

    it('when addresses match rows, then returns a Map keyed by address', async () => {
      const models = [
        { id: 'id-1', address: 'alice@internxt.com' },
        { id: 'id-2', address: 'bob@internxt.me' },
      ] as unknown as MailAddressModel[];
      addressModel.findAll.mockResolvedValue(models);

      const result = await repository.findAddressIdsByAddresses([
        'alice@internxt.com',
        'bob@internxt.me',
        'missing@internxt.com',
      ]);

      expect(addressModel.findAll).toHaveBeenCalledWith({
        where: {
          address: {
            [Op.in]: [
              'alice@internxt.com',
              'bob@internxt.me',
              'missing@internxt.com',
            ],
          },
        },
        attributes: ['id', 'address'],
      });
      expect(result).toEqual(
        new Map([
          ['alice@internxt.com', 'id-1'],
          ['bob@internxt.me', 'id-2'],
        ]),
      );
    });
  });

  describe('findBucketContextByProviderInternalId', () => {
    it('when a provider link resolves to an account, then returns userUuid and networkBucketId', async () => {
      const link = {
        address: {
          networkBucketId: 'bucket-1',
          account: { userId: 'user-uuid-1' },
        },
      } as unknown as MailProviderAccountModel;
      providerAccountModel.findOne.mockResolvedValue(link);

      const result =
        await repository.findBucketContextByProviderInternalId('42');

      expect(providerAccountModel.findOne).toHaveBeenCalledWith({
        where: { providerInternalId: '42' },
        include: [
          {
            model: MailAddressModel,
            required: true,
            include: [{ model: MailAccountModel, required: true }],
          },
        ],
      });
      expect(result).toEqual({
        userUuid: 'user-uuid-1',
        networkBucketId: 'bucket-1',
      });
    });

    it('when no provider link matches, then returns null', async () => {
      providerAccountModel.findOne.mockResolvedValue(null);

      const result =
        await repository.findBucketContextByProviderInternalId('999');

      expect(result).toBeNull();
    });
  });

  describe('setNetworkBucketId', () => {
    it('when given an id and bucket id, then updates the address row', async () => {
      await repository.setNetworkBucketId('addr-1', 'bucket-1');

      expect(addressModel.update).toHaveBeenCalledWith(
        { networkBucketId: 'bucket-1' },
        { where: { id: 'addr-1' } },
      );
    });
  });
});
