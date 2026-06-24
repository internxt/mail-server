import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BridgeModule } from '../infrastructure/bridge/bridge.module.js';
import { MailBucketEntryModel } from './models/mail-bucket-entry.model.js';
import { MailBucketEntryRepository } from './repositories/mail-bucket-entry.repository.js';
import { MailUsageService } from './mail-usage.service.js';

@Module({
  imports: [SequelizeModule.forFeature([MailBucketEntryModel]), BridgeModule],
  providers: [MailBucketEntryRepository, MailUsageService],
  exports: [MailUsageService],
})
export class MailUsageModule {}
