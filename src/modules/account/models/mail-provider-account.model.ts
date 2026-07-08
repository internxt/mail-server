import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { MailAddressModel } from './mail-address.model.js';

@Table({
  underscored: true,
  timestamps: true,
  paranoid: true,
  tableName: 'mail_provider_accounts',
  indexes: [
    {
      name: 'mail_provider_accounts_provider_external_id_active_unique',
      unique: true,
      fields: ['provider', 'external_id'],
      where: { deleted_at: null },
    },
    {
      name: 'mail_provider_accounts_mail_address_id_active_unique',
      unique: true,
      fields: ['mail_address_id'],
      where: { deleted_at: null },
    },
  ],
})
export class MailProviderAccountModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @ForeignKey(() => MailAddressModel)
  @Column(DataType.UUID)
  declare mailAddressId: string;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare provider: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  declare externalId: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  declare providerInternalId: string;

  @Column(DataType.DATE)
  declare deletedAt: Date | null;

  @BelongsTo(() => MailAddressModel)
  declare address: MailAddressModel;
}
