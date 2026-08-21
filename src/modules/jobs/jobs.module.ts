import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountModule } from '../account/account.module.js';
import { AccountPurgeScheduler } from './tasks/account-purge/account-purge.scheduler.js';

@Module({
  imports: [ScheduleModule.forRoot(), AccountModule],
  providers: [AccountPurgeScheduler],
})
export class JobsModule {}
