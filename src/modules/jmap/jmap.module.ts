import { Module } from '@nestjs/common';
import { JmapService } from './jmap.service.js';

@Module({
  providers: [JmapService],
  exports: [JmapService],
})
export class JmapModule {}
