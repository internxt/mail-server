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
import { MailAccountModel } from './mail-account.model.js';

@Table({
  underscored: true,
  timestamps: true,
  tableName: 'mail_account_keys',
})
export class MailAccountKeysModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Unique
  @ForeignKey(() => MailAccountModel)
  @Column(DataType.UUID)
  declare mailAccountId: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare publicKey: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare encryptionPrivateKey: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare recoveryPrivateKey: string;

  @BelongsTo(() => MailAccountModel)
  declare account: MailAccountModel;
}
