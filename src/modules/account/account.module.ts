import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { StalwartModule } from '../infrastructure/stalwart/stalwart.module.js';
import { AccountService } from './account.service.js';
import {
  MailAccountModel,
  MailAddressModel,
  MailDomainModel,
  MailProviderAccountModel,
} from './models/index.js';
import { AccountRepository } from './repositories/account.repository.js';
import { AddressRepository } from './repositories/address.repository.js';
import { DomainRepository } from './repositories/domain.repository.js';

@Module({
  imports: [
    SequelizeModule.forFeature([
      MailAccountModel,
      MailAddressModel,
      MailDomainModel,
      MailProviderAccountModel,
    ]),
    StalwartModule,
  ],
  providers: [
    AccountRepository,
    AddressRepository,
    DomainRepository,
    AccountService,
  ],
  exports: [AccountService, DomainRepository],
})
export class AccountModule {}
