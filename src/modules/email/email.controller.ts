import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { MailAddress } from '../account/decorators/mail-address.decorator.js';
import { MailAccountGuard } from '../provisioning/provisioning.guard.js';
import { EmailService } from './email.service.js';
import {
  DraftEmailRequestDto,
  EmailCreatedResponseDto,
  EmailListResponseDto,
  EmailResponseDto,
  LookupRecipientKeysRequestDto,
  LookupRecipientKeysResponseDto,
  MailboxResponseDto,
  SearchEmailQueryDto,
  MailDomainDto,
  SendEmailRequestDto,
  UpdateEmailRequestDto,
} from './email.dto.js';
import type { MailboxType } from './email.types.js';
import { AccountService } from '../account/account.service.js';
import { SkipMailAccountCheck } from '../provisioning/skip-mail-account-check.decorator.js';

@ApiBearerAuth()
@ApiTags('Email')
@UseGuards(MailAccountGuard)
@Controller('email')
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly accountService: AccountService,
  ) {}

  @Get('domains')
  @SkipMailAccountCheck()
  @ApiOperation({
    summary: 'List domains',
    description: 'Returns every domain for the authenticated user.',
  })
  @ApiOkResponse({ type: [MailDomainDto] })
  getDomains() {
    return this.accountService.listActiveDomains();
  }

  @Get('mailboxes')
  @ApiOperation({
    summary: 'List mailboxes',
    description:
      'Returns every mailbox for the authenticated user, including folder counts.',
  })
  @ApiOkResponse({ type: [MailboxResponseDto] })
  getMailboxes(@MailAddress('address') email: string) {
    return this.emailService.getMailboxes(email);
  }

  @Get()
  @ApiOperation({
    summary: 'List emails',
    description:
      'Paginated list of email summaries. Filter by mailbox or omit to list all.',
  })
  @ApiQuery({
    name: 'mailbox',
    required: false,
    enum: ['inbox', 'drafts', 'sent', 'trash', 'spam', 'archive'],
    description:
      'Mailbox to filter by. Omit to list emails from all mailboxes.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of emails to return. Defaults to `20`.',
    example: 20,
  })
  @ApiQuery({
    name: 'position',
    required: false,
    type: Number,
    description: 'Zero-based offset for pagination. Defaults to `0`.',
    example: 0,
  })
  @ApiQuery({
    name: 'anchorId',
    required: false,
    type: String,
    description: 'Anchor ID for pagination.',
    example: 'Ma1f09b…',
  })
  @ApiQuery({
    name: 'unread',
    required: false,
    type: Boolean,
    description: 'Filter by read status.',
    example: true,
  })
  @ApiOkResponse({ type: EmailListResponseDto })
  list(
    @MailAddress('address') email: string,
    @Query('mailbox') mailbox?: MailboxType,
    @Query('limit') limit?: string,
    @Query('position') position?: string,
    @Query('anchorId') anchorId?: string,
    @Query('unread') unread?: boolean,
  ) {
    return this.emailService.listEmails({
      userEmail: email,
      mailbox: mailbox ?? undefined,
      limit: limit ? Number(limit) || 20 : 20,
      position: position ? Number(position) || 0 : 0,
      anchorId,
      unread,
    });
  }

  @Post('search')
  @ApiOperation({
    summary: 'Search emails',
    description:
      'Search emails by text, sender, recipient, date range, read status or attachment.',
  })
  @ApiBody({ type: SearchEmailQueryDto })
  @ApiOkResponse({ type: EmailListResponseDto })
  search(
    @MailAddress('address') email: string,
    @Body() body: SearchEmailQueryDto,
  ) {
    const { limit, position, ...filters } = body;

    return this.emailService.search({
      userEmail: email,
      limit: limit ?? 20,
      position: position ?? 0,
      filter: filters,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get email by ID',
    description:
      'Returns the full email including body content, headers, and metadata.',
  })
  @ApiParam({ name: 'id', description: 'Email ID' })
  @ApiOkResponse({ type: EmailResponseDto })
  @ApiNotFoundResponse({ description: 'Email not found' })
  get(@MailAddress('address') email: string, @Param('id') id: string) {
    return this.emailService.getEmail(email, id);
  }

  @Post('keys/lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Look up recipient public keys',
    description:
      'Returns the public encryption key for each address if it belongs to an ' +
      'active Internxt domain. Returns null for external or unknown addresses.',
  })
  @ApiBody({ type: LookupRecipientKeysRequestDto })
  @ApiOkResponse({ type: LookupRecipientKeysResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid request: 1-50 valid emails required',
  })
  lookupRecipientKeys(
    @Body() dto: LookupRecipientKeysRequestDto,
  ): Promise<LookupRecipientKeysResponseDto> {
    return this.emailService.lookupRecipientKeys(dto.addresses);
  }

  @Post('send')
  @ApiOperation({
    summary: 'Send an email',
    description:
      'Composes and sends an email on behalf of the authenticated user. ' +
      'At least one recipient in `to` is required.',
  })
  @ApiBody({ type: SendEmailRequestDto })
  @ApiOkResponse({
    type: EmailCreatedResponseDto,
    description: 'Email sent successfully',
  })
  send(
    @MailAddress('address') email: string,
    @Body() dto: SendEmailRequestDto,
  ) {
    return this.emailService.sendEmail(email, dto);
  }

  @Post('drafts')
  @ApiOperation({
    summary: 'Save a draft',
    description:
      'Creates a new draft email. All fields are optional so partial drafts can be saved.',
  })
  @ApiBody({ type: DraftEmailRequestDto })
  @ApiOkResponse({
    type: EmailCreatedResponseDto,
    description: 'Draft saved successfully',
  })
  saveDraft(
    @MailAddress('address') email: string,
    @Body() dto: DraftEmailRequestDto,
  ) {
    return this.emailService.saveDraft(email, dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Update an email',
    description:
      'Partially update an email: move it to another mailbox, mark as read/unread, ' +
      'or flag/unflag. Multiple operations can be combined in a single request.',
  })
  @ApiParam({ name: 'id', description: 'Email ID' })
  @ApiBody({ type: UpdateEmailRequestDto })
  @ApiNoContentResponse({ description: 'Email updated successfully' })
  @ApiNotFoundResponse({ description: 'Email not found' })
  async update(
    @MailAddress('address') email: string,
    @Param('id') id: string,
    @Body() body: UpdateEmailRequestDto,
  ) {
    const ops: Promise<void>[] = [];
    if (body.mailbox !== undefined) {
      ops.push(this.emailService.moveEmail(email, id, body.mailbox));
    }
    if (body.isRead !== undefined) {
      ops.push(this.emailService.markAsRead(email, id, body.isRead));
    }
    if (body.isFlagged !== undefined) {
      ops.push(this.emailService.markAsFlagged(email, id, body.isFlagged));
    }
    await Promise.all(ops);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an email',
    description: 'Permanently deletes an email by ID.',
  })
  @ApiParam({ name: 'id', description: 'Email ID' })
  @ApiNoContentResponse({ description: 'Email deleted successfully' })
  @ApiNotFoundResponse({ description: 'Email not found' })
  delete(@MailAddress('address') email: string, @Param('id') id: string) {
    return this.emailService.deleteEmail(email, id);
  }
}
