import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { AccountService } from '../account/account.service.js';
import { MailUsageService } from '../usage/mail-usage.service.js';
import { AccountUsageResponseDto } from './dto/account-usage.response.dto.js';
import { GatewayAuthGuard } from './gateway.guard.js';

@ApiTags('Gateway')
@ApiBearerAuth('gateway')
@Public()
@UseGuards(GatewayAuthGuard)
@Controller('gateway')
export class GatewayController {
  constructor(
    private readonly accountService: AccountService,
    private readonly mailUsageService: MailUsageService,
  ) {}

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

  @Get('accounts/:uuid/usage')
  @ApiParam({ name: 'uuid', description: 'The UUID of the account' })
  @ApiOkResponse({ type: AccountUsageResponseDto })
  @ApiOperation({
    summary: 'Get the mail storage charged to a user, in bytes',
    description:
      'Reports the mail share of the shared plan counter, so callers can add ' +
      'it to their own usage and arrive at the same total that gates uploads ' +
      'and inbound delivery. Returns 0 for users without a mail account.',
  })
  async getAccountUsage(
    @Param('uuid', ParseUUIDPipe) uuid: string,
  ): Promise<AccountUsageResponseDto> {
    const usage = await this.mailUsageService.getChargedBytes(uuid);

    return { userId: uuid, usage };
  }

  @Post('accounts/:uuid/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'uuid', description: 'The UUID of the account' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiNotFoundResponse({ description: 'Account not found' })
  @ApiOperation({ summary: 'Suspend a mail account' })
  async suspendAccount(@Param('uuid', ParseUUIDPipe) uuid: string) {
    await this.accountService.suspendAccount(uuid);
  }

  @Post('accounts/:uuid/reactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'uuid', description: 'The UUID of the account' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiNotFoundResponse({ description: 'Account not found' })
  @ApiOperation({ summary: 'Reactivate a mail account' })
  async reactivateAccount(@Param('uuid', ParseUUIDPipe) uuid: string) {
    await this.accountService.reactivateAccount(uuid);
  }
}
