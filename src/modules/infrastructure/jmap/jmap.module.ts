import { Module } from '@nestjs/common';
import { MailProvider } from '../../email/mail-provider.port.js';
import { JmapService } from './jmap.service.js';
import { JmapMailProvider } from './jmap-mail.provider.js';

@Module({
  providers: [
    JmapService,
    { provide: MailProvider, useClass: JmapMailProvider },
  ],
  exports: [MailProvider],
})
export class JmapModule {}
