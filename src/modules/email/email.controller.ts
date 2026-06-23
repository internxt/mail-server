import {
  BadRequestException,
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
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
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
  UploadAttachmentResponseDto,
} from './email.dto.js';
import type { MailboxType } from './email.types.js';
import { AccountService } from '../account/account.service.js';
import { SkipMailAccountCheck } from '../provisioning/skip-mail-account-check.decorator.js';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  buildContentDisposition,
  sanitizeFilename,
  sanitizeMimeType,
} from './attachment-headers.js';

export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

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

  @Get('threads/:id')
  @ApiOperation({
    summary: 'Get email thread by id',
    description:
      'Returns all emails in the same thread as the given id, ordered ' +
      'chronologically. If the email has no replies, returns a single-element array.',
  })
  @ApiParam({ name: 'id', description: 'Any email id in the thread' })
  @ApiOkResponse({ type: [EmailResponseDto] })
  @ApiNotFoundResponse({ description: 'Email not found' })
  getThread(@MailAddress('address') email: string, @Param('id') id: string) {
    return this.emailService.getThread(email, id);
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
    if (dto.deliveryMode === 'EXTERNAL') {
      return this.emailService.sendExternalEmail(email, dto);
    }
    return this.emailService.sendEmail(email, dto);
  }

  @Post('drafts')
  @ApiOperation({
    summary: 'Save a draft',
    description:
      'Creates a new draft email. All fields are optional so partial drafts can be saved. ' +
      "Pass `encryption` to store the body encrypted only with the sender's key — the sender " +
      'is the only reader and can decrypt it on retrieval.',
  })
  @ApiBody({ type: DraftEmailRequestDto })
  @ApiOkResponse({
    type: EmailResponseDto,
    description: 'Draft saved successfully',
  })
  saveDraft(
    @MailAddress('address') email: string,
    @Body() dto: DraftEmailRequestDto,
  ) {
    return this.emailService.saveDraft(email, dto);
  }

  @Patch('drafts/:id')
  @ApiOperation({
    summary: 'Update a draft',
    description:
      'Updates a draft email. All fields are optional so partial drafts can be saved. ' +
      'Pass `encryption` with a fresh envelope to replace the stored body — the previous ' +
      'envelope is dropped together with the destroyed draft.',
  })
  @ApiBody({ type: DraftEmailRequestDto })
  @ApiOkResponse({
    type: EmailResponseDto,
    description: 'Draft updated successfully',
  })
  @ApiNotFoundResponse({ description: 'Draft not found' })
  updateDraft(
    @MailAddress('address') email: string,
    @Param('id') draftId: string,
    @Body() dto: DraftEmailRequestDto,
  ) {
    return this.emailService.updateDraft(email, draftId, dto);
  }

  @Get('drafts/:id')
  @ApiOperation({
    summary: 'Get a draft',
    description: 'Returns a draft',
  })
  @ApiParam({ name: 'id', description: 'Draft ID' })
  @ApiOkResponse({ type: EmailResponseDto })
  @ApiNotFoundResponse({ description: 'Draft not found' })
  getDraft(@MailAddress('address') email: string, @Param('id') id: string) {
    return this.emailService.getDraft(email, id);
  }

  @Delete('drafts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Discard a draft',
    description:
      'Permanently discards a draft by ID. Returns 404 if the email exists ' +
      'but is not a draft.',
  })
  @ApiParam({ name: 'id', description: 'Draft ID' })
  @ApiNoContentResponse({ description: 'Draft discarded successfully' })
  @ApiNotFoundResponse({ description: 'Draft not found' })
  discardDraft(@MailAddress('address') email: string, @Param('id') id: string) {
    return this.emailService.discardDraft(email, id);
  }

  @Post('attachment')
  @ApiOperation({
    summary: 'Upload an attachment',
    description:
      'Uploads an attachment and get the info to attach it to an user email.',
  })
  @UseInterceptors(
    FilesInterceptor('attachments', 1, {
      storage: memoryStorage(), // NOSONAR — 25MB matches Gmail's attachment cap; enforced by Multer
      limits: {
        fileSize: MAX_TOTAL_BYTES,
        fieldSize: MAX_TOTAL_BYTES,
      },
    }),
  )
  @ApiOkResponse({
    type: UploadAttachmentResponseDto,
    description: 'Upload attachment successfully',
  })
  async uploadAttachment(
    @UploadedFiles() files: Express.Multer.File[],
    @MailAddress('address') email: string,
  ): Promise<UploadAttachmentResponseDto> {
    const [file] = files;
    if (!file) throw new BadRequestException('No files uploaded');

    const result = await this.emailService.uploadAttachment({
      userEmail: email,
      blob: {
        name: file.originalname,
        buffer: file.buffer,
        mimeType: file.mimetype,
      },
    });

    return { ...result, name: file.originalname };
  }

  @Get(':id/attachment/:blobId')
  @ApiOperation({
    summary: 'Download an attachment',
    description:
      'Streams the bytes of an attachment from the given email. ' +
      'Optional `name` and `type` query params set the response filename and content-type.',
  })
  @ApiParam({ name: 'id', description: 'Email ID' })
  @ApiParam({ name: 'blobId', description: 'Attachment blob ID' })
  @ApiQuery({ name: 'name', required: false, example: 'photo.jpg' })
  @ApiQuery({ name: 'type', required: false, example: 'image/jpeg' })
  async downloadAttachment(
    @MailAddress('address') email: string,
    @Param('id') emailId: string,
    @Param('blobId') blobId: string,
    @Query('name') name: string | undefined,
    @Query('type') type: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const safeType = sanitizeMimeType(type);

    const attachment = await this.emailService.getAttachment(
      email,
      emailId,
      blobId,
    );
    const resolvedName = sanitizeFilename(name ?? attachment.name);

    const result = await this.emailService.downloadAttachment({
      userEmail: email,
      blobId,
      name: resolvedName,
      type: safeType ?? undefined,
    });

    const resolvedType = safeType ?? result.contentType;

    res.setHeader('Content-Type', resolvedType);
    res.setHeader('Content-Disposition', buildContentDisposition(resolvedName));
    if (result.contentLength !== undefined)
      res.setHeader('Content-Length', result.contentLength);

    return new StreamableFile(result.stream);
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
