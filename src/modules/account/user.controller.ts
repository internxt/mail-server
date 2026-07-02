import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GetMailAccountKeysDto } from './dto/get-mail-account-keys.dto.js';
import { User } from '../auth/decorators/user.decorator.js';
import type { UserPayload } from '../auth/jwt-payload.dto.js';
import { AccountService } from './account.service.js';
import { CreateMailAccountDto } from './dto/create-mail-account.dto.js';
import { MailAccountGuard } from '../provisioning/provisioning.guard.js';
import { MailAddress } from './decorators/mail-address.decorator.js';
import {
  CreateMailAccountResponseDto,
  MailAccountKeysResponseDto,
  MailAccountStatusResponseDto,
} from './dto/mail-account.response.dto.js';

@ApiTags('User')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly accountService: AccountService) {}

  @Get('me/mail-account')
  @UseGuards(MailAccountGuard)
  @ApiOperation({
    summary: 'Get the caller`s mail account status',
    description:
      'Returns the account status. When suspended, includes `suspendedAt` and the scheduled `deletionAt`.',
  })
  @ApiOkResponse({ type: MailAccountStatusResponseDto })
  @ApiNotFoundResponse({ description: 'No mail account exists for the caller' })
  async getMailAccount(
    @User() user: UserPayload,
  ): Promise<MailAccountStatusResponseDto> {
    return this.accountService.getAccountStatus(user.uuid);
  }

  @Post('me/mail-account')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Provision the caller`s mail account' })
  @ApiCreatedResponse({ type: CreateMailAccountResponseDto })
  @ApiForbiddenResponse({
    description: 'Caller`s tier does not include mail access',
  })
  @ApiNotFoundResponse({ description: 'Requested domain does not exist' })
  @ApiConflictResponse({
    description: 'Caller already has an account, or the address is taken',
  })
  async createMailAccount(
    @User() user: UserPayload,
    @Body() dto: CreateMailAccountDto,
  ): Promise<CreateMailAccountResponseDto> {
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
  @UseGuards(MailAccountGuard)
  @ApiOperation({
    summary: 'Get encryption keys and salt for one of the caller`s addresses',
    description:
      'If `address` is omitted, returns keys for the caller`s primary address.',
  })
  @ApiOkResponse({ type: MailAccountKeysResponseDto })
  @ApiNotFoundResponse({
    description: 'Address not found on this account, or keys not set',
  })
  async getMailAccountKeys(
    @User() user: UserPayload,
    @MailAddress('address') defaultAddress: string,
    @Query() query: GetMailAccountKeysDto,
  ): Promise<MailAccountKeysResponseDto> {
    const address = query.address ?? defaultAddress;
    return this.accountService.getAddressKeys(user.uuid, address);
  }
}
