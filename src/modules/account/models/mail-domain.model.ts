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
  tableName: 'mail_domains',
})
export class MailDomainModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(255))
  declare domain: string;

  @AllowNull(false)
  @Default('active')
  @Column(DataType.STRING(20))
  declare status: string;

  @HasMany(() => MailAddressModel)
  declare addresses: MailAddressModel[];
}
