import { describe, it, expect, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { MailAddressKeysRepository } from './mail-address-keys.repository.js';
import { MailAddressKeysModel } from '../models/mail-address-keys.model.js';
import { newMailAddressKeysAttributes } from '../../../../test/fixtures.js';

describe('MailAddressKeysRepository', () => {
  let repository: MailAddressKeysRepository;
  let keysModel: DeepMocked<typeof MailAddressKeysModel>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MailAddressKeysRepository],
    })
      .useMocker((token) => {
        if (token === getModelToken(MailAddressKeysModel)) {
          return createMock<typeof MailAddressKeysModel>();
        }
        return createMock<object>();
      })
      .compile();

    repository = module.get(MailAddressKeysRepository);
    keysModel = module.get(getModelToken(MailAddressKeysModel));
  });

  describe('create', () => {
    it('when given valid params, then persists and returns domain entity', async () => {
      const attrs = newMailAddressKeysAttributes();
      const params = {
        mailAddressId: attrs.mailAddressId,
        publicKey: attrs.publicKey,
        encryptionPrivateKey: attrs.encryptionPrivateKey,
        recoveryPrivateKey: attrs.recoveryPrivateKey,
      };
      keysModel.create.mockResolvedValue(
        attrs as unknown as MailAddressKeysModel,
      );

      const result = await repository.create(params);

      expect(keysModel.create).toHaveBeenCalledWith(params);
      expect(result.id).toBe(attrs.id);
      expect(result.mailAddressId).toBe(attrs.mailAddressId);
      expect(result.publicKey).toBe(attrs.publicKey);
    });
  });

  describe('findByAddressId', () => {
    it('when keys exist, then returns the domain entity', async () => {
      const attrs = newMailAddressKeysAttributes();
      keysModel.findOne.mockResolvedValue(
        attrs as unknown as MailAddressKeysModel,
      );

      const result = await repository.findByAddressId(attrs.mailAddressId);

      expect(keysModel.findOne).toHaveBeenCalledWith({
        where: { mailAddressId: attrs.mailAddressId },
      });
      expect(result?.id).toBe(attrs.id);
      expect(result?.mailAddressId).toBe(attrs.mailAddressId);
    });

    it('when no keys exist, then returns null', async () => {
      keysModel.findOne.mockResolvedValue(null);

      const result = await repository.findByAddressId('missing-id');

      expect(result).toBeNull();
    });
  });

  describe('deleteByAddressId', () => {
    it('when called, then deletes rows matching mailAddressId', async () => {
      await repository.deleteByAddressId('addr-id');

      expect(keysModel.destroy).toHaveBeenCalledWith({
        where: { mailAddressId: 'addr-id' },
      });
    });
  });
});
