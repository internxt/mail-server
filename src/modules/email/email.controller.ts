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
import { EmailUsecase } from './email.usecase.js';
import type { EmailCreate, ID } from '../jmap/jmap.types.js';

// TODO: Replace with actual authenticated user from AuthGuard
const STUB_USER = 'jose@codekishi.com';

@ApiTags('Email')
@Controller('email')
export class EmailController {
  constructor(private readonly emailUsecase: EmailUsecase) {}

  @Get('mailboxes')
  getMailboxes() {
    return this.emailUsecase.getMailboxes(STUB_USER);
  }

  @Get('identities')
  getIdentities() {
    return this.emailUsecase.getIdentities(STUB_USER);
  }

  @Get()
  list(
    @Query('mailboxId') mailboxId: string,
    @Query('limit') limit?: string,
    @Query('position') position?: string,
  ) {
    return this.emailUsecase.listEmails(
      STUB_USER,
      mailboxId,
      limit ? Number(limit) || undefined : undefined,
      position ? Number(position) || undefined : undefined,
    );
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.emailUsecase.getEmailById(STUB_USER, id);
  }

  @Patch(':id/keywords')
  setKeywords(
    @Param('id') id: string,
    @Body() keywords: Record<string, boolean>,
  ) {
    return this.emailUsecase.setEmailKeywords(STUB_USER, id, keywords);
  }

  @Patch(':id/move')
  move(@Param('id') id: string, @Body() mailboxIds: Record<ID, boolean>) {
    return this.emailUsecase.moveEmail(STUB_USER, id, mailboxIds);
  }

  @Delete()
  destroy(@Body() body: { ids: string[] }) {
    return this.emailUsecase.destroyEmails(STUB_USER, body.ids);
  }

  @Post('send')
  send(@Body() body: { email: EmailCreate; identityId: string }) {
    return this.emailUsecase.sendEmail(STUB_USER, body.email, body.identityId);
  }
}
