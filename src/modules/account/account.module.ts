import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Reflector } from '@nestjs/core';
import { StalwartModule } from '../infrastructure/stalwart/stalwart.module.js';
import { PaymentsModule } from '../infrastructure/payments/payments.module.js';
import { BridgeModule } from '../infrastructure/bridge/bridge.module.js';
import { AccountPurgeService } from './account-purge.service.js';
import { AccountService } from './account.service.js';
import { UserController } from './user.controller.js';
import { MailAccountGuard } from '../provisioning/provisioning.guard.js';
import {
  MailAddressKeysModel,
  MailAccountModel,
  MailAddressModel,
  MailDeletedAddressModel,
  MailDomainModel,
  MailProviderAccountModel,
} from './models/index.js';
import { AccountRepository } from './repositories/account.repository.js';
import { AddressRepository } from './repositories/address.repository.js';
import { DeletedAddressRepository } from './repositories/deleted-address.repository.js';
import { DomainRepository } from './repositories/domain.repository.js';
import { MailAddressKeysRepository } from './repositories/mail-address-keys.repository.js';

@Module({
  imports: [
    SequelizeModule.forFeature([
      MailAccountModel,
      MailAddressKeysModel,
      MailAddressModel,
      MailDeletedAddressModel,
      MailDomainModel,
      MailProviderAccountModel,
    ]),
    StalwartModule,
    PaymentsModule,
    BridgeModule,
  ],
  controllers: [UserController],
  providers: [
    AccountRepository,
    AddressRepository,
    DeletedAddressRepository,
    DomainRepository,
    MailAddressKeysRepository,
    AccountService,
    AccountPurgeService,
    MailAccountGuard,
    Reflector,
  ],
  exports: [AccountService, AccountPurgeService],
})
export class AccountModule {}
