import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AccountRepository } from './account.repository.js';
import { MailAccountModel } from '../models/mail-account.model.js';
import { MailAddressModel } from '../models/mail-address.model.js';
import { MailProviderAccountModel } from '../models/mail-provider-account.model.js';
import { MailAccountState } from '../domain/mail-account.domain.js';

describe('AccountRepository', () => {
  let repository: AccountRepository;
  let accountModel: DeepMocked<typeof MailAccountModel>;
  let sequelize: DeepMocked<Sequelize>;

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
    sequelize = module.get(Sequelize);
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

  describe('claimExpiredSuspended', () => {
    const threshold = new Date('2026-08-01T00:00:00.000Z');

    it('when accounts are past retention, then claims them and returns them', async () => {
      sequelize.query.mockResolvedValue([
        { id: 'acc-1', userId: 'user-1' },
      ] as never);

      const claimed = await repository.claimExpiredSuspended({
        suspendedBefore: threshold,
        limit: 10,
      });

      expect(claimed).toEqual([{ id: 'acc-1', userId: 'user-1' }]);
    });

    it('when claiming, then moves suspended rows into deleting in one statement', async () => {
      sequelize.query.mockResolvedValue([] as never);

      await repository.claimExpiredSuspended({
        suspendedBefore: threshold,
        limit: 10,
      });

      expect(sequelize.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE mail_accounts'),
        {
          replacements: {
            deleting: MailAccountState.Deleting,
            suspended: MailAccountState.Suspended,
            threshold,
            limit: 10,
          },
          type: QueryTypes.SELECT,
        },
      );
    });

    it('when claiming, then the statement leases only rows nobody else holds', async () => {
      sequelize.query.mockResolvedValue([] as never);

      await repository.claimExpiredSuspended({
        suspendedBefore: threshold,
        limit: 10,
      });

      const clauses = [
        'deleted_at IS NULL',
        'status = :suspended',
        'suspended_at < :threshold',
        'FOR UPDATE SKIP LOCKED',
        'RETURNING id, user_id AS "userId"',
      ];
      for (const clause of clauses) {
        expect(sequelize.query).toHaveBeenCalledWith(
          expect.stringContaining(clause),
          expect.anything(),
        );
      }
    });

    it('when the batch has no room left, then does not touch the database', async () => {
      const claimed = await repository.claimExpiredSuspended({
        suspendedBefore: threshold,
        limit: 0,
      });

      expect(claimed).toEqual([]);
      expect(sequelize.query).not.toHaveBeenCalled();
    });
  });

  describe('claimStalledDeletions', () => {
    it('when a claim has gone stale, then takes it back for another run', async () => {
      const threshold = new Date('2026-08-21T12:00:00.000Z');
      sequelize.query.mockResolvedValue([
        { id: 'acc-1', userId: 'user-1' },
      ] as never);

      const claimed = await repository.claimStalledDeletions({
        updatedBefore: threshold,
        limit: 5,
      });

      expect(sequelize.query).toHaveBeenCalledWith(
        expect.stringContaining('updated_at < :threshold'),
        {
          replacements: {
            deleting: MailAccountState.Deleting,
            threshold,
            limit: 5,
          },
          type: QueryTypes.SELECT,
        },
      );
      expect(claimed).toEqual([{ id: 'acc-1', userId: 'user-1' }]);
    });
  });
});
