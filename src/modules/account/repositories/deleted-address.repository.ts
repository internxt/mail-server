import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { MailDeletedAddressModel } from '../models/mail-deleted-address.model.js';

const MAX_BATCH_LOOKUP = 50;

export type RecordDeletedAddressParams = {
  address: string;
  userId: string;
};

@Injectable()
export class DeletedAddressRepository {
  constructor(
    @InjectModel(MailDeletedAddressModel)
    private readonly deletedAddressModel: typeof MailDeletedAddressModel,
  ) {}

  async record(entries: RecordDeletedAddressParams[]): Promise<void> {
    if (entries.length === 0) return;

    await this.deletedAddressModel.bulkCreate(entries, {
      ignoreDuplicates: true,
    });
  }

  async findClaimedByOthers(
    addresses: string[],
    userId: string,
  ): Promise<Set<string>> {
    if (addresses.length === 0) return new Set();

    const models = await this.deletedAddressModel.findAll({
      where: {
        address: { [Op.in]: addresses.slice(0, MAX_BATCH_LOOKUP) },
        userId: { [Op.ne]: userId },
      },
      attributes: ['address'],
    });

    return new Set(models.map((m) => m.address));
  }
}
