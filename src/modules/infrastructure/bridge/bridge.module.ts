import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BridgeClient } from './bridge.service.js';

@Module({
  imports: [JwtModule.register({})],
  providers: [BridgeClient],
  exports: [BridgeClient],
})
export class BridgeModule {}
