import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { StalwartModule } from '../infrastructure/stalwart/stalwart.module.js';
import { PaymentsModule } from '../infrastructure/payments/payments.module.js';
import { DriveGatewayModule } from '../infrastructure/drive/drive-gateway.module.js';
import { AccountService } from './account.service.js';
import { MailAccountsController } from './mail-accounts.controller.js';
import {
  MailAddressKeysModel,
  MailAccountModel,
  MailAddressModel,
  MailDomainModel,
  MailProviderAccountModel,
} from './models/index.js';
import { AccountRepository } from './repositories/account.repository.js';
import { AddressRepository } from './repositories/address.repository.js';
import { DomainRepository } from './repositories/domain.repository.js';
import { MailAddressKeysRepository } from './repositories/mail-address-keys.repository.js';

@Module({
  imports: [
    SequelizeModule.forFeature([
      MailAccountModel,
      MailAddressKeysModel,
      MailAddressModel,
      MailDomainModel,
      MailProviderAccountModel,
    ]),
    StalwartModule,
    PaymentsModule,
    DriveGatewayModule,
  ],
  controllers: [MailAccountsController],
  providers: [
    AccountRepository,
    AddressRepository,
    DomainRepository,
    MailAddressKeysRepository,
    AccountService,
  ],
  exports: [AccountService],
})
export class AccountModule {}
