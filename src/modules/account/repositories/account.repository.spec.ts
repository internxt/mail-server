import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { AccountRepository } from './account.repository.js';
import { MailAccountModel } from '../models/mail-account.model.js';
import { MailAddressModel } from '../models/mail-address.model.js';
import { MailProviderAccountModel } from '../models/mail-provider-account.model.js';
import { MailAccountState } from '../domain/mail-account.domain.js';

describe('AccountRepository', () => {
  let repository: AccountRepository;
  let accountModel: DeepMocked<typeof MailAccountModel>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountRepository],
    })
      .useMocker((token) => {
        if (token === getModelToken(MailAccountModel)) {
          return createMock<typeof MailAccountModel>();
        }
        return createMock<object>();
      })
      .compile();

    repository = module.get(AccountRepository);
    accountModel = module.get(getModelToken(MailAccountModel));
  });

  const buildModel = (overrides: Partial<MailAccountModel> = {}) =>
    ({
      id: 'acc-1',
      userId: 'user-1',
      status: 'active',
      suspendedAt: null,
      networkBucketId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      addresses: [],
      ...overrides,
    }) as unknown as MailAccountModel;

  describe('findByUserId', () => {
    it('when account exists, then includes addresses and provider links in the query', async () => {
      accountModel.findOne.mockResolvedValue(buildModel());

      await repository.findByUserId('user-1');

      expect(accountModel.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        include: [
          {
            model: MailAddressModel,
            include: [MailProviderAccountModel],
          },
        ],
      });
    });

    it('when account is active, then maps status and null suspendedAt to domain', async () => {
      accountModel.findOne.mockResolvedValue(
        buildModel({ status: 'active', suspendedAt: null }),
      );

      const result = await repository.findByUserId('user-1');

      expect(result?.status).toBe(MailAccountState.Active);
      expect(result?.suspendedAt).toBeNull();
      expect(result?.isSuspended).toBe(false);
    });

    it('when account is suspended, then maps status and suspendedAt to domain', async () => {
      const suspendedAt = new Date('2026-03-15T10:00:00.000Z');
      accountModel.findOne.mockResolvedValue(
        buildModel({ status: 'suspended', suspendedAt }),
      );

      const result = await repository.findByUserId('user-1');

      expect(result?.status).toBe(MailAccountState.Suspended);
      expect(result?.suspendedAt).toEqual(suspendedAt);
      expect(result?.isSuspended).toBe(true);
    });

    it('when account does not exist, then returns null', async () => {
      accountModel.findOne.mockResolvedValue(null);

      const result = await repository.findByUserId('unknown');

      expect(result).toBeNull();
    });

    it('when addresses are missing on the model, then returns empty addresses', async () => {
      accountModel.findOne.mockResolvedValue(
        buildModel({ addresses: undefined as unknown as MailAddressModel[] }),
      );

      const result = await repository.findByUserId('user-1');

      expect(result?.addresses).toEqual([]);
    });
  });

  describe('create', () => {
    it('when given a userId, then creates the account and maps it to domain', async () => {
      accountModel.create.mockResolvedValue(buildModel());

      const result = await repository.create({ userId: 'user-1' });

      expect(accountModel.create).toHaveBeenCalledWith(
        { userId: 'user-1' },
        {
          include: [
            { model: MailAddressModel, include: [MailProviderAccountModel] },
          ],
        },
      );
      expect(result.userId).toBe('user-1');
      expect(result.status).toBe(MailAccountState.Active);
    });
  });

  describe('delete', () => {
    it('when given an id, then destroys by id', async () => {
      await repository.delete('acc-1');

      expect(accountModel.destroy).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
      });
    });
  });

  describe('setNetworkBucketId', () => {
    it('when given an id and bucket id, then updates the account row', async () => {
      await repository.setNetworkBucketId('acc-1', 'bucket-1');

      expect(accountModel.update).toHaveBeenCalledWith(
        { networkBucketId: 'bucket-1' },
        { where: { id: 'acc-1' } },
      );
    });
  });

  describe('suspend', () => {
    it('when given an id, then sets status suspended and suspendedAt', async () => {
      await repository.suspend('acc-1');

      expect(accountModel.update).toHaveBeenCalledWith(
        {
          status: MailAccountState.Suspended,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          suspendedAt: expect.any(Date),
        },
        { where: { id: 'acc-1' } },
      );
    });
  });

  describe('reactivate', () => {
    it('when given an id, then sets status active and clears suspendedAt', async () => {
      await repository.reactivate('acc-1');

      expect(accountModel.update).toHaveBeenCalledWith(
        { status: MailAccountState.Active, suspendedAt: null },
        { where: { id: 'acc-1' } },
      );
    });
  });
});
