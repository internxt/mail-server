import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module.js';
import { MailUsageModule } from '../usage/mail-usage.module.js';
import { StalwartEventsController } from './stalwart-events.controller.js';
import { StalwartEventsAuthGuard } from './stalwart-events-auth.guard.js';
import { StalwartEventsService } from './stalwart-events.service.js';

@Module({
  imports: [AccountModule, MailUsageModule],
  controllers: [StalwartEventsController],
  providers: [StalwartEventsAuthGuard, StalwartEventsService],
})
export class StalwartEventsModule {}
