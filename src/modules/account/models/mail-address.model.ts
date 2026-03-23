import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  HasOne,
  Index,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';
import { MailAccountModel } from './mail-account.model.js';
import { MailDomainModel } from './mail-domain.model.js';
import { MailProviderAccountModel } from './mail-provider-account.model.js';

@Table({
  underscored: true,
  timestamps: true,
  tableName: 'mail_addresses',
})
export class MailAddressModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @ForeignKey(() => MailAccountModel)
  @Index
  @Column(DataType.UUID)
  declare mailAccountId: string;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(255))
  declare address: string;

  @AllowNull(false)
  @ForeignKey(() => MailDomainModel)
  @Index
  @Column(DataType.UUID)
  declare domainId: string;

  @AllowNull(false)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare isDefault: boolean;

  @BelongsTo(() => MailAccountModel)
  declare account: MailAccountModel;

  @BelongsTo(() => MailDomainModel)
  declare domain: MailDomainModel;

  @HasOne(() => MailProviderAccountModel)
  declare providerAccount: MailProviderAccountModel;
}
