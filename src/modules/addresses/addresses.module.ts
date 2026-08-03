import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AccountModule } from '../account/account.module.js';
import { AddressesController } from './addresses.controller.js';
import { ThrottlerGuard } from '../../common/guards/throttler.guard.js';

@Module({
  imports: [
    PassportModule,
    AccountModule,
    ThrottlerModule.forRoot({
      // We are going to create a default throttler that can be overrided in any endpoint by doing
      // @Throttle({ default: { limit: X, ttl: Y } })
      throttlers: [{ name: 'default', limit: 60, ttl: 60_000 }],
      storage: new ThrottlerStorageRedisService(process.env.REDIS_URL),
    }),
  ],
  controllers: [AddressesController],
  providers: [ThrottlerGuard],
})
export class AddressesModule {}
