import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JmapService } from './jmap.service';

@Module({
  imports: [HttpModule],
  providers: [JmapService],
  exports: [JmapService],
})
export class JmapModule {}
