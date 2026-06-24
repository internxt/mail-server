import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { UniqueConstraintError } from 'sequelize';
import {
  DuplicateEntryKeyError,
  MailBucketEntryRepository,
} from './mail-bucket-entry.repository.js';
import { MailBucketEntryModel } from '../models/mail-bucket-entry.model.js';

describe('MailBucketEntryRepository', () => {
  let repository: MailBucketEntryRepository;
  let entryModel: DeepMocked<typeof MailBucketEntryModel>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MailBucketEntryRepository],
    })
      .useMocker(() => createMock<object>())
      .compile();

    repository = module.get(MailBucketEntryRepository);
    entryModel = module.get(getModelToken(MailBucketEntryModel));
  });

  describe('create', () => {
    it('when persisting, then returns the entry with size coerced to a number', async () => {
      const now = new Date();
      entryModel.create.mockResolvedValue({
        id: 'row-1',
        mailAddressId: 'address-1',
        entryKey: '42:7',
        bridgeEntryId: 'entry-1',
        size: '240',
        createdAt: now,
        updatedAt: now,
      } as unknown as MailBucketEntryModel);

      const result = await repository.create({
        mailAddressId: 'address-1',
        entryKey: '42:7',
        bridgeEntryId: 'entry-1',
        size: 240,
      });

      expect(entryModel.create).toHaveBeenCalledWith({
        mailAddressId: 'address-1',
        entryKey: '42:7',
        bridgeEntryId: 'entry-1',
        size: 240,
      });
      expect(result.size).toBe(240);
      expect(result.entryKey).toBe('42:7');
    });

    it('when the entry key already exists, then throws DuplicateEntryKeyError', async () => {
      entryModel.create.mockRejectedValue(
        new UniqueConstraintError({ errors: [] }),
      );

      await expect(
        repository.create({
          mailAddressId: 'address-1',
          entryKey: '42:7',
          bridgeEntryId: 'entry-1',
          size: 240,
        }),
      ).rejects.toBeInstanceOf(DuplicateEntryKeyError);
    });

    it('when persistence fails for another reason, then rethrows the original error', async () => {
      entryModel.create.mockRejectedValue(new Error('DB down'));

      await expect(
        repository.create({
          mailAddressId: 'address-1',
          entryKey: '42:7',
          bridgeEntryId: 'entry-1',
          size: 240,
        }),
      ).rejects.toThrow('DB down');
    });
  });

  describe('findByEntryKey', () => {
    it('when a row exists, then returns the domain entry', async () => {
      const now = new Date();
      entryModel.findOne.mockResolvedValue({
        id: 'row-1',
        mailAddressId: 'address-1',
        entryKey: '42:7',
        bridgeEntryId: 'entry-1',
        size: '240',
        createdAt: now,
        updatedAt: now,
      } as unknown as MailBucketEntryModel);

      const result = await repository.findByEntryKey('42:7');

      expect(entryModel.findOne).toHaveBeenCalledWith({
        where: { entryKey: '42:7' },
      });
      expect(result?.bridgeEntryId).toBe('entry-1');
    });

    it('when no row matches, then returns null', async () => {
      entryModel.findOne.mockResolvedValue(null);

      const result = await repository.findByEntryKey('42:7');

      expect(result).toBeNull();
    });
  });

  describe('deleteByEntryKey', () => {
    it('when called, then destroys the row matching the entry key', async () => {
      await repository.deleteByEntryKey('42:7');

      expect(entryModel.destroy).toHaveBeenCalledWith({
        where: { entryKey: '42:7' },
      });
    });
  });
});
