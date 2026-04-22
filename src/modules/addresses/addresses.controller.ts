import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator.js';
import { AccountService } from '../account/account.service.js';
import {
  CheckAvailabilityQueryDto,
  CheckAvailabilityResponseDto,
} from './addresses.dto.js';

@ApiTags('Addresses')
@ApiBearerAuth('addresses')
@Public()
@Controller('addresses')
export class AddressesController {
  constructor(private readonly accountService: AccountService) {}

  @Get('availability')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 10_000 } })
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
