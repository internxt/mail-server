import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { AccountService } from '../account/account.service.js';
import { GatewayAuthGuard } from './gateway.guard.js';

@ApiTags('Gateway')
@ApiBearerAuth('gateway')
@Public()
@UseGuards(GatewayAuthGuard)
@Controller('gateway')
export class GatewayController {
  constructor(private readonly accountService: AccountService) {}

  @Get('addresses/:address')
  @ApiOperation({
    summary: 'Get a mail address resource (used to resolve drive user id)',
  })
  async getAddress(@Param('address') address: string) {
    const normalized = address.toLowerCase();
    const userId = await this.accountService.findUserIdByAddress(normalized);

    if (!userId) {
      throw new NotFoundException(`Address '${address}' not found`);
    }

    return { address: normalized, userId };
  }

  @Post('accounts/:uuid/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Suspend a mail account' })
  async suspendAccount(@Param('uuid') _uuid: string) {
    // mark as frozen and suspend account in Stalwart
  }

  @Post('accounts/:uuid/reactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reactivate a mail account' })
  async reactivateAccount(@Param('uuid') _uuid: string) {
    // unmark as frozen and reactivate account in Stalwart
  }
}
