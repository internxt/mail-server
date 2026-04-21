import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AccountModule } from '../account/account.module.js';
import { GatewayJwtStrategy } from './gateway-jwt.strategy.js';
import { GatewayAuthGuard } from './gateway.guard.js';
import { GatewayController } from './gateway.controller.js';

@Module({
  imports: [
    PassportModule,
    AccountModule,
    ThrottlerModule.forRoot({
      // We are going to create a default throttler that can be override in any endpoint by doing
      // @Throttle({ default: { limit: X, ttl: Y } })
      throttlers: [{ name: 'default', limit: 60, ttl: 60_000 }],
      storage: new ThrottlerStorageRedisService(process.env.REDIS_URL),
    }),
  ],
  controllers: [GatewayController],
  providers: [GatewayJwtStrategy, GatewayAuthGuard],
})
export class GatewayModule {}
