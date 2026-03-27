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
import { User } from '../auth/decorators/user.decorator.js';
import { MailAccountGuard } from '../provisioning/provisioning.guard.js';
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

@ApiBearerAuth()
@ApiTags('Email')
@UseGuards(MailAccountGuard)
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
  getMailboxes(@User('email') email: string) {
    return this.emailService.getMailboxes(email);
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
    @User('email') email: string,
    @Query('mailbox') mailbox: MailboxType = 'inbox',
    @Query('limit') limit?: string,
    @Query('position') position?: string,
  ) {
    return this.emailService.listEmails(
      email,
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
  get(@User('email') email: string, @Param('id') id: string) {
    return this.emailService.getEmail(email, id);
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
  send(@User('email') email: string, @Body() dto: SendEmailRequestDto) {
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
  saveDraft(@User('email') email: string, @Body() dto: DraftEmailRequestDto) {
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
    @User('email') email: string,
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
  delete(@User('email') email: string, @Param('id') id: string) {
    return this.emailService.deleteEmail(email, id);
  }
}
