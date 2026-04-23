import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../auth/decorators/user.decorator.js';
import type { UserPayload } from '../auth/jwt-payload.dto.js';
import { PaymentsService } from '../infrastructure/payments/payments.service.js';
import { DriveGatewayClient } from '../infrastructure/drive/drive-gateway.client.js';
import { AccountService } from './account.service.js';
import { CreateMailAccountDto } from './dto/create-mail-account.dto.js';

@ApiTags('Mail accounts')
@ApiBearerAuth()
@Controller('mail-accounts')
export class MailAccountsController {
  private readonly logger = new Logger(MailAccountsController.name);

  constructor(
    private readonly accountService: AccountService,
    private readonly payments: PaymentsService,
    private readonly driveGateway: DriveGatewayClient,
  ) {}

  @Post()
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

    await this.driveGateway.verifyPassword(user.uuid, dto.encryptedPassword);

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
        salt: dto.keys.salt,
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
}
