import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AccountService } from '../account/account.service.js';
import { ThrottlerGuard } from '../../common/guards/throttler.guard.js';
import {
  CheckAvailabilityQueryDto,
  CheckAvailabilityResponseDto,
} from './addresses.dto.js';

@ApiTags('Addresses')
@ApiBearerAuth('addresses')
@Controller('addresses')
export class AddressesController {
  constructor(private readonly accountService: AccountService) {}

  @Get('availability')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 10_000 } })
  @ApiOperation({
    summary: 'Check address availability (called by the auth service)',
  })
  async checkAvailability(
    @Query() query: CheckAvailabilityQueryDto,
  ): Promise<CheckAvailabilityResponseDto> {
    return this.accountService.checkAddressAvailability(
      query.username,
      query.domain,
    );
  }
}
