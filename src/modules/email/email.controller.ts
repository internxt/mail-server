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
} from '@nestjs/common';
import {
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
import { EmailService } from './email.service.js';
import {
  DraftEmailRequestDto,
  EmailCreatedResponseDto,
  EmailListResponseDto,
  EmailResponseDto,
  MailboxResponseDto,
  SendEmailRequestDto,
  UpdateEmailRequestDto,
} from './email.dto.js';
import type { MailboxType } from './email.types.js';

// TODO: Replace with actual authenticated user from AuthGuard
export const STUB_USER = 'jose@codekishi.com';

@ApiBearerAuth()
@ApiTags('Email')
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Get('mailboxes')
  @ApiOperation({
    summary: 'List mailboxes',
    description:
      'Returns every mailbox for the authenticated user, including folder counts.',
  })
  @ApiOkResponse({ type: [MailboxResponseDto] })
  getMailboxes() {
    return this.emailService.getMailboxes(STUB_USER);
  }

  @Get()
  @ApiOperation({
    summary: 'List emails',
    description:
      'Paginated list of email summaries for a given mailbox. Defaults to the inbox.',
  })
  @ApiQuery({
    name: 'mailbox',
    required: false,
    enum: ['inbox', 'drafts', 'sent', 'trash', 'spam', 'archive'],
    description: 'Mailbox to list. Defaults to `inbox`.',
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
  @ApiOkResponse({ type: EmailListResponseDto })
  list(
    @Query('mailbox') mailbox: MailboxType = 'inbox',
    @Query('limit') limit?: string,
    @Query('position') position?: string,
  ) {
    return this.emailService.listEmails(
      STUB_USER,
      mailbox,
      limit ? Number(limit) || 20 : 20,
      position ? Number(position) || 0 : 0,
    );
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
  get(@Param('id') id: string) {
    return this.emailService.getEmail(STUB_USER, id);
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
  send(@Body() dto: SendEmailRequestDto) {
    return this.emailService.sendEmail(STUB_USER, dto);
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
  saveDraft(@Body() dto: DraftEmailRequestDto) {
    return this.emailService.saveDraft(STUB_USER, dto);
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
  async update(@Param('id') id: string, @Body() body: UpdateEmailRequestDto) {
    const ops: Promise<void>[] = [];
    if (body.mailbox !== undefined) {
      ops.push(this.emailService.moveEmail(STUB_USER, id, body.mailbox));
    }
    if (body.isRead !== undefined) {
      ops.push(this.emailService.markAsRead(STUB_USER, id, body.isRead));
    }
    if (body.isFlagged !== undefined) {
      ops.push(this.emailService.markAsFlagged(STUB_USER, id, body.isFlagged));
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
  delete(@Param('id') id: string) {
    return this.emailService.deleteEmail(STUB_USER, id);
  }
}
