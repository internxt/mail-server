import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  MailAccountKeys,
  type MailAccountKeysAttributes,
} from '../domain/mail-account-keys.domain.js';
import { MailAccountKeysModel } from '../models/mail-account-keys.model.js';

export interface CreateMailAccountKeysParams {
  mailAccountId: string;
  publicKey: string;
  encryptionPrivateKey: string;
  recoveryPrivateKey: string;
}

@Injectable()
export class MailAccountKeysRepository {
  constructor(
    @InjectModel(MailAccountKeysModel)
    private readonly keysModel: typeof MailAccountKeysModel,
  ) {}

  async create(params: CreateMailAccountKeysParams): Promise<MailAccountKeys> {
    const model = await this.keysModel.create({ ...params });
    return this.toDomain(model);
  }

  async findByAccountId(
    mailAccountId: string,
  ): Promise<MailAccountKeys | null> {
    const model = await this.keysModel.findOne({ where: { mailAccountId } });
    return model ? this.toDomain(model) : null;
  }

  async deleteByAccountId(mailAccountId: string): Promise<void> {
    await this.keysModel.destroy({ where: { mailAccountId } });
  }

  private toDomain(model: MailAccountKeysModel): MailAccountKeys {
    const attrs: MailAccountKeysAttributes = {
      id: model.id,
      mailAccountId: model.mailAccountId,
      publicKey: model.publicKey,
      encryptionPrivateKey: model.encryptionPrivateKey,
      recoveryPrivateKey: model.recoveryPrivateKey,
      createdAt: model.createdAt as Date,
      updatedAt: model.updatedAt as Date,
    };
    return MailAccountKeys.build(attrs);
  }
}
