import {
  AllowNull,
  Column,
  DataType,
  Default,
  HasMany,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';
import { MailAddressModel } from './mail-address.model.js';

@Table({
  underscored: true,
  timestamps: true,
  tableName: 'mail_accounts',
})
export class MailAccountModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Unique
  @Column(DataType.UUID)
  declare driveUserUuid: string;

  @HasMany(() => MailAddressModel)
  declare addresses: MailAddressModel[];
}
