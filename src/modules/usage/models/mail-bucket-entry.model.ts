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
import { MailAddressModel } from '../../account/models/mail-address.model.js';

@Table({
  underscored: true,
  timestamps: true,
  tableName: 'mail_bucket_entries',
})
export class MailBucketEntryModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @ForeignKey(() => MailAddressModel)
  @Column(DataType.UUID)
  declare mailAddressId: string;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(255))
  declare entryKey: string;

  @AllowNull(false)
  @Column(DataType.STRING(24))
  declare bridgeEntryId: string;

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare size: string;

  @BelongsTo(() => MailAddressModel)
  declare address: MailAddressModel;
}
