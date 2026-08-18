import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, fn, UniqueConstraintError } from 'sequelize';
import { MailAccountModel } from '../../account/models/mail-account.model.js';
import { MailAddressModel } from '../../account/models/mail-address.model.js';
import {
  MailBucketEntry,
  type MailBucketEntryAttributes,
} from '../domain/mail-bucket-entry.domain.js';
import { MailBucketEntryModel } from '../models/mail-bucket-entry.model.js';

export interface CreateMailBucketEntryParams {
  mailAddressId: string;
  entryKey: string;
  bridgeEntryId: string;
  size: number;
}

export class DuplicateEntryKeyError extends Error {
  constructor(entryKey: string) {
    super(`Bucket entry already tracked for key '${entryKey}'`);
    this.name = 'DuplicateEntryKeyError';
  }
}

@Injectable()
export class MailBucketEntryRepository {
  constructor(
    @InjectModel(MailBucketEntryModel)
    private readonly entryModel: typeof MailBucketEntryModel,
  ) {}

  async create(params: CreateMailBucketEntryParams): Promise<MailBucketEntry> {
    try {
      const model = await this.entryModel.create({ ...params });
      return this.toDomain(model);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntryKeyError(params.entryKey);
      }
      throw error;
    }
  }

  async findByEntryKey(entryKey: string): Promise<MailBucketEntry | null> {
    const model = await this.entryModel.findOne({ where: { entryKey } });
    return model ? this.toDomain(model) : null;
  }

  async deleteByEntryKey(entryKey: string): Promise<void> {
    await this.entryModel.destroy({ where: { entryKey } });
  }

  async sumSizeByUserUuid(userUuid: string): Promise<number> {
    const row = (await this.entryModel.findOne({
      attributes: [[fn('SUM', col('size')), 'total']],
      include: [
        {
          model: MailAddressModel,
          attributes: [],
          required: true,
          paranoid: false,
          include: [
            {
              model: MailAccountModel,
              attributes: [],
              required: true,
              paranoid: false,
              where: { userId: userUuid },
            },
          ],
        },
      ],
      raw: true,
    })) as { total: string | number | null } | null;

    return Number(row?.total ?? 0);
  }

  private toDomain(model: MailBucketEntryModel): MailBucketEntry {
    const attrs: MailBucketEntryAttributes = {
      id: model.id,
      mailAddressId: model.mailAddressId,
      entryKey: model.entryKey,
      bridgeEntryId: model.bridgeEntryId,
      size: Number(model.size),
      createdAt: model.createdAt as Date,
      updatedAt: model.updatedAt as Date,
    };
    return MailBucketEntry.build(attrs);
  }
}
