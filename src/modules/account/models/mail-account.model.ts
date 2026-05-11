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
  paranoid: true,
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
  declare userId: string;

  @AllowNull(false)
  @Default('active')
  @Column(DataType.STRING(20))
  declare state: string;

  @Column(DataType.DATE)
  declare suspendedAt: Date | null;

  @Column(DataType.DATE)
  declare deletedAt: Date | null;

  @HasMany(() => MailAddressModel)
  declare addresses: MailAddressModel[];
}
