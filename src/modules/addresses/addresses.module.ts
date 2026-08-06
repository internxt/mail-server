import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AccountModule } from '../account/account.module.js';
import { AddressesController } from './addresses.controller.js';

@Module({
  imports: [PassportModule, AccountModule],
  controllers: [AddressesController],
})
export class AddressesModule {}
