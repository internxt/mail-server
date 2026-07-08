import {
  AllowNull,
  Column,
  DataType,
  Default,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { MailAddressModel } from './mail-address.model.js';

@Table({
  underscored: true,
  timestamps: true,
  paranoid: true,
  tableName: 'mail_accounts',
  indexes: [
    {
      name: 'mail_accounts_user_id_active_unique',
      unique: true,
      fields: ['user_id'],
      where: { deleted_at: null },
    },
  ],
})
export class MailAccountModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @AllowNull(false)
  @Column(DataType.UUID)
  declare userId: string;

  @AllowNull(false)
  @Default('active')
  @Column(DataType.STRING(20))
  declare status: string;

  @Column(DataType.DATE)
  declare suspendedAt: Date | null;

  @AllowNull(true)
  @Column({ field: 'network_bucket_id', type: DataType.UUID })
  declare networkBucketId: string | null;

  @Column(DataType.DATE)
  declare deletedAt: Date | null;

  @HasMany(() => MailAddressModel)
  declare addresses: MailAddressModel[];
}
