import {
  AllowNull,
  Column,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';

@Table({
  underscored: true,
  timestamps: true,
  tableName: 'mail_deleted_addresses',
})
export class MailDeletedAddressModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(255))
  declare address: string;

  @AllowNull(false)
  @Column(DataType.UUID)
  declare userId: string;
}
