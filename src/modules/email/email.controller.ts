import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EmailService } from './email.service.js';
import type {
  DraftEmailDto,
  MailboxType,
  SendEmailDto,
} from './email.types.js';

// TODO: Replace with actual authenticated user from AuthGuard
const STUB_USER = 'test-andres';

@ApiTags('Email')
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Get('mailboxes')
  getMailboxes() {
    return this.emailService.getMailboxes(STUB_USER);
  }

  @Get()
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
  get(@Param('id') id: string) {
    return this.emailService.getEmail(STUB_USER, id);
  }

  @Post('send')
  send(@Body() dto: SendEmailDto) {
    return this.emailService.sendEmail(STUB_USER, dto);
  }

  @Post('drafts')
  saveDraft(@Body() dto: DraftEmailDto) {
    return this.emailService.saveDraft(STUB_USER, dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      mailbox?: MailboxType;
      isRead?: boolean;
      isFlagged?: boolean;
    },
  ) {
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
  delete(@Param('id') id: string) {
    return this.emailService.deleteEmail(STUB_USER, id);
  }
}
