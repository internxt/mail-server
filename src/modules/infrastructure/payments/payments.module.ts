import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [JwtModule.register({})],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
