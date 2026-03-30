import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module.js';
import { MailAccountGuard } from './provisioning.guard.js';

@Module({
  imports: [AccountModule],
  providers: [MailAccountGuard],
  exports: [MailAccountGuard, AccountModule],
})
export class ProvisioningModule {}
