import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module.js';
import { BridgeModule } from '../infrastructure/bridge/bridge.module.js';
import { MtaHooksAuthGuard } from './mta-hooks-auth.guard.js';
import { MtaHooksController } from './mta-hooks.controller.js';
import { MtaHooksService } from './mta-hooks.service.js';

@Module({
  imports: [AccountModule, BridgeModule],
  controllers: [MtaHooksController],
  providers: [MtaHooksService, MtaHooksAuthGuard],
})
export class MtaHooksModule {}
