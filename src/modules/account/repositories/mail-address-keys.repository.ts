import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  MailAddressKeys,
  type MailAddressKeysAttributes,
} from '../domain/mail-address-keys.domain.js';
import { MailAddressKeysModel } from '../models/mail-address-keys.model.js';

export interface CreateMailAddressKeysParams {
  mailAddressId: string;
  publicKey: string;
  encryptionPrivateKey: string;
  recoveryPrivateKey: string;
}

@Injectable()
export class MailAddressKeysRepository {
  constructor(
    @InjectModel(MailAddressKeysModel)
    private readonly keysModel: typeof MailAddressKeysModel,
  ) {}

  async create(params: CreateMailAddressKeysParams): Promise<MailAddressKeys> {
    const model = await this.keysModel.create({ ...params });
    return this.toDomain(model);
  }

  async findByAddressId(
    mailAddressId: string,
  ): Promise<MailAddressKeys | null> {
    const model = await this.keysModel.findOne({ where: { mailAddressId } });
    return model ? this.toDomain(model) : null;
  }

  async deleteByAddressId(mailAddressId: string): Promise<void> {
    await this.keysModel.destroy({ where: { mailAddressId } });
  }

  private toDomain(model: MailAddressKeysModel): MailAddressKeys {
    const attrs: MailAddressKeysAttributes = {
      id: model.id,
      mailAddressId: model.mailAddressId,
      publicKey: model.publicKey,
      encryptionPrivateKey: model.encryptionPrivateKey,
      recoveryPrivateKey: model.recoveryPrivateKey,
      createdAt: model.createdAt as Date,
      updatedAt: model.updatedAt as Date,
    };
    return MailAddressKeys.build(attrs);
  }
}
