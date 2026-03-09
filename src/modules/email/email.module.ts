import { Module } from '@nestjs/common';
import { JmapModule } from '../jmap/jmap.module.js';
import { JmapMailProvider } from '../jmap/jmap-mail.provider.js';
import { EmailController } from './email.controller.js';
import { EmailService } from './email.service.js';
import { MAIL_PROVIDER } from './mail-provider.port.js';

@Module({
  imports: [JmapModule],
  controllers: [EmailController],
  providers: [
    EmailService,
    { provide: MAIL_PROVIDER, useExisting: JmapMailProvider },
  ],
})
export class EmailModule {}
