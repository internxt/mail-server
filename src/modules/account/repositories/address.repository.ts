import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  MailAddress,
  type MailAddressAttributes,
} from '../domain/mail-address.domain.js';
import { MailAccountModel } from '../models/mail-account.model.js';
import { MailAddressModel } from '../models/mail-address.model.js';
import { MailProviderAccountModel } from '../models/mail-provider-account.model.js';

const MAX_BATCH_LOOKUP = 50;

export function toAddressAttributes(
  model: MailAddressModel,
): MailAddressAttributes {
  const providerExternalId = model.providerAccount?.externalId;
  if (!providerExternalId) {
    throw new Error(`Address '${model.id}' has no provider link`);
  }

  return {
    id: model.id,
    mailAccountId: model.mailAccountId,
    address: model.address,
    domainId: model.domainId,
    isDefault: model.isDefault,
    providerExternalId,
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

  async findByAddresses(addresses: string[]): Promise<Set<string>> {
    if (addresses.length === 0) return new Set();
    if (addresses.length > MAX_BATCH_LOOKUP) {
      throw new Error(
        `findByAddresses: batch size ${addresses.length} exceeds max ${MAX_BATCH_LOOKUP}`,
      );
    }

    const models = await this.addressModel.findAll({
      where: { address: { [Op.in]: addresses } },
    });

    return new Set(models.map((m) => m.address));
  }

  async findAddressIdsByAddresses(
    addresses: string[],
  ): Promise<Map<string, string>> {
    if (addresses.length === 0) return new Map();
    if (addresses.length > MAX_BATCH_LOOKUP) {
      throw new Error(
        `findAddressIdsByAddresses: batch size ${addresses.length} exceeds max ${MAX_BATCH_LOOKUP}`,
      );
    }

    const models = await this.addressModel.findAll({
      where: { address: { [Op.in]: addresses } },
      attributes: ['id', 'address'],
    });

    return new Map(models.map((m) => [m.address, m.id]));
  }

  async findUserIdByAddress(address: string): Promise<string | null> {
    const model = await this.addressModel.findOne({
      where: { address },
      include: [{ model: MailAccountModel }],
    });

    return model?.account?.userId ?? null;
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
  }): Promise<string> {
    const model = await this.addressModel.create(params);
    return model.id;
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
}
