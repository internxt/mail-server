import { Module } from '@nestjs/common';
import { StalwartSmtpService } from './stalwart-smtp.service.js';

@Module({
  providers: [StalwartSmtpService],
  exports: [StalwartSmtpService],
})
export class SmtpModule {}
