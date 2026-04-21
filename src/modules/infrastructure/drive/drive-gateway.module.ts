import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DriveGatewayClient } from './drive-gateway.client.js';

@Module({
  imports: [JwtModule.register({})],
  providers: [DriveGatewayClient],
  exports: [DriveGatewayClient],
})
export class DriveGatewayModule {}
