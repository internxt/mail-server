import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetMailAccountKeysDto } from './dto/get-mail-account-keys.dto.js';
import { User } from '../auth/decorators/user.decorator.js';
import type { UserPayload } from '../auth/jwt-payload.dto.js';
import { PaymentsService } from '../infrastructure/payments/payments.service.js';
import { AccountService } from './account.service.js';
import { CreateMailAccountDto } from './dto/create-mail-account.dto.js';

@ApiTags('User')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(
    private readonly accountService: AccountService,
    private readonly payments: PaymentsService,
  ) {}

  @Post('me/mail-account')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Provision the caller`s mail account' })
  async createMailAccount(
    @User() user: UserPayload,
    @Body() dto: CreateMailAccountDto,
  ) {
    const tier = await this.payments.getUserTier(user.uuid);
    if (!tier.featuresPerService.mail?.enabled) {
      throw new ForbiddenException(
        'Mail access is not available for your current plan',
      );
    }

    const fullAddress = `${dto.address}@${dto.domain}`;

    const account = await this.accountService.provisionAccount({
      userId: user.uuid,
      address: fullAddress,
      domain: dto.domain,
      displayName: dto.displayName,
      keys: {
        publicKey: dto.keys.publicKey,
        encryptionPrivateKey: dto.keys.encryptionPrivateKey,
        recoveryPrivateKey: dto.keys.recoveryPrivateKey,
      },
    });

    this.logger.log(
      `Provisioned mail account for '${user.uuid}' at '${fullAddress}'`,
    );

    return {
      id: account.id,
      address: account.defaultAddress?.address ?? fullAddress,
      domain: dto.domain,
    };
  }

  @Get('me/mail-account/keys')
  @ApiOperation({
    summary: 'Get encryption keys and salt for one of the caller`s addresses',
  })
  async getMailAccountKeys(
    @User() user: UserPayload,
    @Query() query: GetMailAccountKeysDto,
  ) {
    return this.accountService.getAddressKeys(user.uuid, query.address);
  }
}
