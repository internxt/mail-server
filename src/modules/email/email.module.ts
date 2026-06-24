import { Module } from '@nestjs/common';
import { MailUsageModule } from '../usage/mail-usage.module.js';
import { JmapModule } from '../infrastructure/jmap/jmap.module.js';
import { SmtpModule } from '../infrastructure/smtp/smtp.module.js';
import { ProvisioningModule } from '../provisioning/provisioning.module.js';
import { EmailController } from './email.controller.js';
import { EmailService } from './email.service.js';
import { Reflector } from '@nestjs/core';

@Module({
  imports: [JmapModule, SmtpModule, ProvisioningModule, MailUsageModule],
  controllers: [EmailController],
  providers: [EmailService, Reflector],
})
export class EmailModule {}
