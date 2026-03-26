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
  Unique,
} from 'sequelize-typescript';
import { MailAddressModel } from './mail-address.model.js';

@Table({
  underscored: true,
  timestamps: true,
  paranoid: true,
  tableName: 'mail_provider_accounts',
  indexes: [{ unique: true, fields: ['provider', 'external_id'] }],
})
export class MailProviderAccountModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Unique
  @ForeignKey(() => MailAddressModel)
  @Column(DataType.UUID)
  declare mailAddressId: string;

  @AllowNull(false)
  @Column(DataType.STRING)
  declare provider: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  declare externalId: string;

  @Column(DataType.DATE)
  declare deletedAt: Date | null;

  @BelongsTo(() => MailAddressModel)
  declare address: MailAddressModel;
}
