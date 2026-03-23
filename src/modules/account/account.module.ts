import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import {
  MailAccountModel,
  MailAddressModel,
  MailDomainModel,
  MailProviderAccountModel,
} from './models/index.js';

@Module({
  imports: [
    SequelizeModule.forFeature([
      MailAccountModel,
      MailAddressModel,
      MailDomainModel,
      MailProviderAccountModel,
    ]),
  ],
  exports: [SequelizeModule],
})
export class AccountModule {}
