import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { AccountService } from '../account/account.service.js';
import { GatewayAuthGuard } from './gateway.guard.js';
import { ProvisionAccountRequestDto } from './gateway.dto.js';

@ApiTags('Gateway')
@ApiBearerAuth('gateway')
@Public()
@UseGuards(GatewayAuthGuard)
@Controller('gateway')
export class GatewayController {
  private readonly logger = new Logger(GatewayController.name);

  constructor(private readonly accountService: AccountService) {}

  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Provision a new mail account (called by the auth service)',
  })
  async provisionAccount(@Body() dto: ProvisionAccountRequestDto) {
    const account = await this.accountService.provisionAccount({
      userId: dto.userId,
      address: dto.address,
      domain: dto.domain,
      displayName: dto.displayName,
    });

    this.logger.log(
      `Gateway: provisioned account '${dto.address}' for '${dto.userId}'`,
    );

    return {
      id: account.id,
      userId: account.userId,
      address: account.defaultAddress?.address ?? dto.address,
    };
  }

  @Get('domains')
  @ApiOperation({
    summary: 'List available mail domains (called by the auth service)',
  })
  async listDomains() {
    const activeDomains = await this.accountService.listActiveDomains();
    return activeDomains.map((d) => ({ domain: d.domain }));
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
