import { Module } from '@nestjs/common';
import { JmapService } from './jmap.service.js';
import { JmapMailProvider } from './jmap-mail.provider.js';

@Module({
  providers: [JmapService, JmapMailProvider],
  exports: [JmapService, JmapMailProvider],
})
export class JmapModule {}
