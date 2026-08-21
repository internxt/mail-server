import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccountService } from '../account/account.service.js';
import { User } from '../auth/decorators/user.decorator.js';
import type { UserPayload } from '../auth/jwt-payload.dto.js';
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
  @ApiOperation({
    summary: 'Check address availability (called by the auth service)',
  })
  async checkAvailability(
    @User() user: UserPayload,
    @Query() query: CheckAvailabilityQueryDto,
  ): Promise<CheckAvailabilityResponseDto> {
    return this.accountService.checkAddressAvailability(
      query.username,
      query.domain,
      user.uuid,
    );
  }
}
