import { Module } from '@nestjs/common';
import { JmapModule } from '../infrastructure/jmap/jmap.module.js';
import { ProvisioningModule } from '../provisioning/provisioning.module.js';
import { EmailController } from './email.controller.js';
import { EmailService } from './email.service.js';

@Module({
  imports: [JmapModule, ProvisioningModule],
  controllers: [EmailController],
  providers: [EmailService],
})
export class EmailModule {}
