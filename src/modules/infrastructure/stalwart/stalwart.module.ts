import { Module } from '@nestjs/common';
import { AccountProvider } from '../../account/account-provider.port.js';
import { StalwartService } from './stalwart.service.js';
import { StalwartAccountProvider } from './stalwart-account.provider.js';

@Module({
  providers: [
    StalwartService,
    { provide: AccountProvider, useClass: StalwartAccountProvider },
  ],
  exports: [AccountProvider],
})
export class StalwartModule {}
