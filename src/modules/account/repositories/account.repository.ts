import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  MailAccount,
  MailAccountState,
} from '../domain/mail-account.domain.js';
import { MailAccountModel } from '../models/mail-account.model.js';
import { MailAddressModel } from '../models/mail-address.model.js';
import { MailProviderAccountModel } from '../models/mail-provider-account.model.js';
import { toAddressAttributes } from './address.repository.js';

@Injectable()
export class AccountRepository {
  constructor(
    @InjectModel(MailAccountModel)
    private readonly accountModel: typeof MailAccountModel,
  ) {}

  async findByUserId(userId: string): Promise<MailAccount | null> {
    const model = await this.accountModel.findOne({
      where: { userId },
      include: [
        {
          model: MailAddressModel,
          include: [MailProviderAccountModel],
        },
      ],
    });

    return model ? this.toDomain(model) : null;
  }

  async create(params: { userId: string }): Promise<MailAccount> {
    const model = await this.accountModel.create(
      { userId: params.userId },
      {
        include: [
          { model: MailAddressModel, include: [MailProviderAccountModel] },
        ],
      },
    );
    return this.toDomain(model);
  }

  async delete(id: string, options?: { force?: boolean }): Promise<void> {
    await this.accountModel.destroy({ where: { id }, force: options?.force });
  }

  async setNetworkBucketId(id: string, networkBucketId: string): Promise<void> {
    await this.accountModel.update({ networkBucketId }, { where: { id } });
  }

  async suspend(id: string): Promise<void> {
    await this.accountModel.update(
      { status: MailAccountState.Suspended, suspendedAt: new Date() },
      { where: { id } },
    );
  }

  async reactivate(id: string): Promise<void> {
    await this.accountModel.update(
      { status: MailAccountState.Active, suspendedAt: null },
      { where: { id } },
    );
  }

  private toDomain(model: MailAccountModel): MailAccount {
    return MailAccount.build({
      id: model.id,
      userId: model.userId,
      status: model.status as MailAccountState,
      suspendedAt: model.suspendedAt,
      networkBucketId: model.networkBucketId,
      createdAt: model.createdAt as Date,
      updatedAt: model.updatedAt as Date,
      addresses: (model.addresses ?? []).map(toAddressAttributes),
    });
  }
}
