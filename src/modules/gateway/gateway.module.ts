import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccountModule } from '../account/account.module.js';
import { GatewayJwtStrategy } from './gateway-jwt.strategy.js';
import { GatewayAuthGuard } from './gateway.guard.js';
import { GatewayController } from './gateway.controller.js';

@Module({
  imports: [PassportModule, AccountModule, ThrottlerModule.forRoot()],
  controllers: [GatewayController],
  providers: [GatewayJwtStrategy, GatewayAuthGuard],
})
export class GatewayModule {}
