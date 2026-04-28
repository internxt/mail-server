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
  tableName: 'mail_address_keys',
})
export class MailAddressKeysModel extends Model {
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
  @Column(DataType.TEXT)
  declare publicKey: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare encryptionPrivateKey: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare recoveryPrivateKey: string;

  @BelongsTo(() => MailAddressModel)
  declare address: MailAddressModel;
}
