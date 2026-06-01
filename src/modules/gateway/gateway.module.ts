import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AccountModule } from '../account/account.module.js';
import { EmailModule } from '../email/email.module.js';
import { GatewayJwtStrategy } from './gateway-jwt.strategy.js';
import { GatewayAuthGuard } from './gateway.guard.js';
import { GatewayController } from './gateway.controller.js';

@Module({
  imports: [PassportModule, AccountModule, EmailModule],
  controllers: [GatewayController],
  providers: [GatewayJwtStrategy, GatewayAuthGuard],
})
export class GatewayModule {}
