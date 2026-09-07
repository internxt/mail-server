import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { Op } from 'sequelize';
import { DeletedAddressRepository } from './deleted-address.repository.js';
import { MailDeletedAddressModel } from '../models/mail-deleted-address.model.js';

describe('DeletedAddressRepository', () => {
  let repository: DeletedAddressRepository;
  let model: DeepMocked<typeof MailDeletedAddressModel>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeletedAddressRepository],
    })
      .useMocker((token) => {
        if (token === getModelToken(MailDeletedAddressModel)) {
          return createMock<typeof MailDeletedAddressModel>();
        }
        return createMock<object>();
      })
      .compile();

    repository = module.get(DeletedAddressRepository);
    model = module.get(getModelToken(MailDeletedAddressModel));
  });

  describe('record', () => {
    it('when given addresses, then inserts them ignoring ones already recorded', async () => {
      const entries = [
        { address: 'alice@inxt.com', userId: 'user-1' },
        { address: 'alice2@inxt.com', userId: 'user-1' },
      ];

      await repository.record(entries);

      expect(model.bulkCreate).toHaveBeenCalledWith(entries, {
        ignoreDuplicates: true,
      });
    });

    it('when there is nothing to record, then does not touch the database', async () => {
      await repository.record([]);

      expect(model.bulkCreate).not.toHaveBeenCalled();
    });
  });

  describe('findClaimedByOthers', () => {
    it('when addresses were given up by other users, then returns those addresses', async () => {
      model.findAll.mockResolvedValue([
        { address: 'alice@inxt.com' },
      ] as unknown as MailDeletedAddressModel[]);

      const result = await repository.findClaimedByOthers(
        ['alice@inxt.com', 'bob@inxt.com'],
        'user-1',
      );

      expect(model.findAll).toHaveBeenCalledWith({
        where: {
          address: { [Op.in]: ['alice@inxt.com', 'bob@inxt.com'] },
          userId: { [Op.ne]: 'user-1' },
        },
        attributes: ['address'],
      });
      expect(result).toEqual(new Set(['alice@inxt.com']));
    });

    it('when nothing was given up, then returns an empty set', async () => {
      model.findAll.mockResolvedValue([]);

      const result = await repository.findClaimedByOthers(
        ['alice@inxt.com'],
        'user-1',
      );

      expect(result).toEqual(new Set());
    });

    it('when asked about no addresses, then does not touch the database', async () => {
      const result = await repository.findClaimedByOthers([], 'user-1');

      expect(model.findAll).not.toHaveBeenCalled();
      expect(result).toEqual(new Set());
    });
  });
});
