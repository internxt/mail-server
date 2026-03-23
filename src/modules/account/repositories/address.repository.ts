import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  MailAddress,
  type MailAddressAttributes,
} from '../domain/mail-address.domain.js';
import { MailAddressModel } from '../models/mail-address.model.js';
import { MailProviderAccountModel } from '../models/mail-provider-account.model.js';

export function toAddressAttributes(
  model: MailAddressModel,
): MailAddressAttributes {
  return {
    id: model.id,
    mailAccountId: model.mailAccountId,
    address: model.address,
    domainId: model.domainId,
    isDefault: model.isDefault,
    providerExternalId: model.providerAccount?.externalId ?? null,
    createdAt: model.createdAt as Date,
    updatedAt: model.updatedAt as Date,
  };
}

@Injectable()
export class AddressRepository {
  constructor(
    @InjectModel(MailAddressModel)
    private readonly addressModel: typeof MailAddressModel,
    @InjectModel(MailProviderAccountModel)
    private readonly providerAccountModel: typeof MailProviderAccountModel,
    private readonly sequelize: Sequelize,
  ) {}

  async findByAddress(address: string): Promise<MailAddress | null> {
    const model = await this.addressModel.findOne({
      where: { address },
      include: [MailProviderAccountModel],
    });

    return model ? MailAddress.build(toAddressAttributes(model)) : null;
  }

  async findDefaultForAccount(
    mailAccountId: string,
  ): Promise<MailAddress | null> {
    const model = await this.addressModel.findOne({
      where: { mailAccountId, isDefault: true },
      include: [MailProviderAccountModel],
    });

    return model ? MailAddress.build(toAddressAttributes(model)) : null;
  }

  async findAllForAccount(mailAccountId: string): Promise<MailAddress[]> {
    const models = await this.addressModel.findAll({
      where: { mailAccountId },
      include: [MailProviderAccountModel],
    });

    return models.map((m) => MailAddress.build(toAddressAttributes(m)));
  }

  async create(params: {
    mailAccountId: string;
    address: string;
    domainId: string;
    isDefault: boolean;
  }): Promise<MailAddress> {
    const model = await this.addressModel.create(params);
    return MailAddress.build(toAddressAttributes(model));
  }

  async delete(id: string): Promise<void> {
    await this.addressModel.destroy({ where: { id } });
  }

  async setDefault(addressId: string, mailAccountId: string): Promise<void> {
    await this.sequelize.query(
      `UPDATE mail_addresses SET is_default = (id = :addressId) WHERE mail_account_id = :mailAccountId`,
      { replacements: { addressId, mailAccountId } },
    );
  }

  async createProviderLink(params: {
    mailAddressId: string;
    provider: string;
    externalId: string;
  }): Promise<void> {
    await this.providerAccountModel.create(params);
  }

  async deleteProviderLink(mailAddressId: string): Promise<void> {
    await this.providerAccountModel.destroy({ where: { mailAddressId } });
  }

  async updateAllProviderExternalIds(
    mailAccountId: string,
    newExternalId: string,
  ): Promise<void> {
    await this.sequelize.query(
      `UPDATE mail_provider_accounts SET external_id = :newExternalId
       WHERE mail_address_id IN (SELECT id FROM mail_addresses WHERE mail_account_id = :mailAccountId)`,
      { replacements: { newExternalId, mailAccountId } },
    );
  }
}
