import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { Public } from '../auth/decorators/public.decorator.js';
import { AccountService } from '../account/account.service.js';
import { EmailService } from '../email/email.service.js';
import { GatewayAuthGuard } from './gateway.guard.js';

class UpdateQuotaDto {
  @IsInt()
  @Min(0)
  quotaBytes!: number;
}

@ApiTags('Gateway')
@ApiBearerAuth('gateway')
@Public()
@UseGuards(GatewayAuthGuard)
@Controller('gateway')
export class GatewayController {
  constructor(
    private readonly accountService: AccountService,
    private readonly emailService: EmailService,
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

  @Get('quota/:uuid')
  @ApiOperation({ summary: 'Get mail quota usage for a user' })
  getQuota(@Param('uuid') uuid: string) {
    return this.emailService.getQuotaByUuid(uuid);
  }

  @Put('accounts/:uuid/quota')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set mail quota for a user' })
  async updateQuota(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateQuotaDto,
  ): Promise<void> {
    await this.accountService.updateQuota(uuid, dto.quotaBytes);
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
