import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { UniqueConstraintError } from 'sequelize';
import {
  MailBucketEntry,
  type MailBucketEntryAttributes,
} from '../domain/mail-bucket-entry.domain.js';
import { MailBucketEntryModel } from '../models/mail-bucket-entry.model.js';

export interface CreateMailBucketEntryParams {
  mailAccountId: string;
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

  private toDomain(model: MailBucketEntryModel): MailBucketEntry {
    const attrs: MailBucketEntryAttributes = {
      id: model.id,
      mailAccountId: model.mailAccountId,
      entryKey: model.entryKey,
      bridgeEntryId: model.bridgeEntryId,
      size: Number(model.size),
      createdAt: model.createdAt as Date,
      updatedAt: model.updatedAt as Date,
    };
    return MailBucketEntry.build(attrs);
  }
}
