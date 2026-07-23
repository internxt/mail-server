import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountService } from '../account/account.service.js';
import { MailUsageService } from '../usage/mail-usage.service.js';
import {
  DraftUpdateConflictError,
  MailProvider,
} from './mail-provider.port.js';
import { deriveReplyRecipients, ensureRePrefix } from './threading.js';
import type {
  DraftEmailDto,
  Email,
  EmailAttachment,
  EmailListResponse,
  EmailSummary,
  ListEmails,
  MailDeliveryMode,
  MailQuota,
  Mailbox,
  MailboxType,
  ReplyEmailDto,
  SearchEmailDto,
  SendEmailDto,
  ThreadingHeaders,
} from './email.types.js';
import {
  isEncryptedBody,
  packEnvelope,
  parseEnvelope,
  projectForCaller,
} from './email-encryption.js';
import { convert } from 'html-to-text';
import {
  DownloadAttachmentPayload,
  DownloadAttachmentResponse,
  UploadAttachmentPayload,
  UploadAttachmentResponse,
} from '../infrastructure/jmap/jmap.types.js';
import {
  StalwartSmtpService,
  type SmtpAttachment,
} from '../infrastructure/smtp/stalwart-smtp.service.js';
import {
  decryptAttachment,
  decryptEnvelopeWithServerKey,
  type DecryptedEnvelope,
} from './server-crypto.js';
import type { Readable } from 'node:stream';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly mail: MailProvider,
    private readonly accountService: AccountService,
    private readonly smtp: StalwartSmtpService,
    private readonly configService: ConfigService,
    private readonly usage: MailUsageService,
  ) {}

  getMailboxes(userEmail: string): Promise<Mailbox[]> {
    return this.mail.getMailboxes(userEmail);
  }

  async listEmails(params: ListEmails): Promise<EmailListResponse> {
    const result = await this.mail.listEmails(params);
    await this.enrichEncryptedSummaries(params.userEmail, result.emails);
    return result;
  }

  async getEmail(userEmail: string, id: string): Promise<Email> {
    const email = await this.mail.getEmail(userEmail, id);
    if (!email) {
      throw new NotFoundException(`Email ${id} not found`);
    }
    return email;
  }

  async getThread(userEmail: string, emailId: string): Promise<Email[]> {
    const emails = await this.mail.getThread(userEmail, emailId);
    if (emails.length === 0) {
      throw new NotFoundException(`Email ${emailId} not found`);
    }
    await this.enrichEncryptedSummaries(userEmail, emails);
    return emails;
  }

  async getAttachment(
    userEmail: string,
    emailId: string,
    blobId: string,
  ): Promise<EmailAttachment> {
    const email = await this.getEmail(userEmail, emailId);
    const attachment = email.attachments.find((a) => a.blobId === blobId);
    if (!attachment) throw new NotFoundException('Attachment not found');
    return attachment;
  }

  async search(params: SearchEmailDto): Promise<EmailListResponse> {
    const hasFilter = Object.values(params.filter).some(
      (v) => v !== undefined && v !== '' && (!Array.isArray(v) || v.length > 0),
    );

    if (!hasFilter) {
      return { emails: [], total: 0, hasMoreMails: false };
    }

    const result = await this.mail.search(params);
    await this.enrichEncryptedSummaries(params.userEmail, result.emails);
    return result;
  }

  private async enrichEncryptedSummaries(
    userEmail: string,
    summaries: EmailSummary[],
  ): Promise<void> {
    const encrypted = summaries.filter((s) => isEncryptedBody(s.preview));
    if (encrypted.length === 0) return;

    const bodies = await this.mail.getTextBodies(
      userEmail,
      encrypted.map((s) => s.id),
    );

    for (const summary of encrypted) {
      const body = bodies.get(summary.id);
      const envelope = body ? parseEnvelope(body) : null;
      summary.encryption = envelope ? projectForCaller(envelope) : null;
      summary.preview = '';
    }
  }

  async lookupRecipientKeys(addresses: string[]): Promise<{
    recipients: Array<{ address: string; publicKey: string | null }>;
  }> {
    const recipients =
      await this.accountService.lookupPublicKeysForAddresses(addresses);
    return { recipients };
  }

  async sendEmail(
    userEmail: string,
    dto: SendEmailDto,
  ): Promise<{ id: string }> {
    return this.dispatchInternal(userEmail, dto);
  }

  async sendExternalEmail(
    userEmail: string,
    dto: SendEmailDto,
  ): Promise<{ id: string }> {
    return this.dispatchExternal(userEmail, dto);
  }

  async replyEmail(
    userEmail: string,
    parentEmailId: string,
    dto: ReplyEmailDto,
    deliveryMode?: MailDeliveryMode,
  ): Promise<{ id: string }> {
    const isExternalDeliveryMode = deliveryMode === 'EXTERNAL';
    const threading = await this.resolveThreading(userEmail, parentEmailId);

    const composed = this.composeReply(userEmail, dto, threading);

    return isExternalDeliveryMode
      ? this.dispatchExternal(userEmail, composed, threading)
      : this.dispatchInternal(userEmail, composed, threading);
  }

  private composeReply(
    self: string,
    dto: ReplyEmailDto,
    threading: ThreadingHeaders,
  ): SendEmailDto {
    const { to, cc } = deriveReplyRecipients(
      threading,
      self,
      dto.replyAll ?? false,
      dto.cc,
    );
    const isToEmpty = to.length === 0;

    if (isToEmpty) {
      throw new UnprocessableEntityException(
        'Cannot determine a reply recipient: the original email has no sender',
      );
    }

    return {
      ...dto,
      to,
      cc,
      subject: dto.subject?.trim() || ensureRePrefix(threading.parentSubject),
    };
  }

  private async dispatchInternal(
    userEmail: string,
    dto: SendEmailDto,
    threading?: ThreadingHeaders,
  ): Promise<{ id: string }> {
    if (dto.to.length === 0) {
      throw new BadRequestException('At least one recipient is required');
    }

    if (dto.encryption) {
      dto = {
        ...dto,
        textBody: packEnvelope(dto.encryption),
        htmlBody: undefined,
      };
    }

    return this.mail.sendEmail(userEmail, dto, threading);
  }

  private async dispatchExternal(
    userEmail: string,
    dto: SendEmailDto,
    threading?: ThreadingHeaders,
  ): Promise<{ id: string }> {
    if (dto.to.length === 0) {
      throw new BadRequestException('At least one recipient is required');
    }

    const serverPrivateKey = Buffer.from(
      this.configService.getOrThrow<string>('crypto.serverPrivateKey'),
      'base64',
    );

    const payload = await this.decryptPayloadForExternalDelivery(
      dto,
      serverPrivateKey,
    );
    const attachments = await this.decryptAttachmentsForExternalDelivery(
      userEmail,
      dto,
      payload?.attachmentsSessionKey,
    );

    const htmlBody = payload?.body ?? dto.htmlBody;
    const textBody = htmlBody
      ? convert(htmlBody, { wordwrap: false })
      : dto.textBody;

    const { messageId } = await this.smtp.sendRaw({
      userEmail,
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      subject: dto.subject,
      html: htmlBody,
      text: textBody,
      attachments,
      inReplyTo: threading?.messageId[0],
      references: threading?.references,
    });

    await this.mail.saveToSent(
      userEmail,
      {
        ...dto,
        textBody: dto.encryption ? packEnvelope(dto.encryption) : dto.textBody,
        htmlBody: undefined,
      },
      threading,
      messageId,
    );

    return { id: messageId };
  }

  private async resolveThreading(
    userEmail: string,
    parentEmailId: string,
  ): Promise<ThreadingHeaders> {
    const threading = await this.mail.getThreadingHeaders(
      userEmail,
      parentEmailId,
    );

    if (!threading) {
      throw new NotFoundException(`Replied email ${parentEmailId} not found`);
    }
    return threading;
  }

  private async decryptPayloadForExternalDelivery(
    dto: SendEmailDto,
    serverPrivateKey: Uint8Array,
  ): Promise<DecryptedEnvelope | undefined> {
    if (!dto.encryption?.encryptedText || !dto.encryption.wrappedKeys?.length) {
      return undefined;
    }
    return decryptEnvelopeWithServerKey(dto.encryption, serverPrivateKey);
  }

  private async decryptAttachmentsForExternalDelivery(
    userEmail: string,
    dto: SendEmailDto,
    attachmentKey: Uint8Array | undefined,
  ): Promise<SmtpAttachment[] | undefined> {
    if (!dto.attachments?.length) return undefined;

    if (!attachmentKey) {
      throw new BadRequestException(
        'An encryption block with the attachments session key is required when sending attachments in MIXED mode',
      );
    }

    return Promise.all(
      dto.attachments.map(async (a) => {
        const { stream } = await this.mail.downloadAttachment({
          userEmail,
          blobId: a.blobId,
        });
        const ciphertext = await streamToBuffer(stream);
        const plaintext = await decryptAttachment(ciphertext, attachmentKey);
        return {
          filename: a.name,
          content: Buffer.from(plaintext),
          contentType: a.type,
        };
      }),
    );
  }

  saveDraft(userEmail: string, dto: DraftEmailDto): Promise<Email> {
    return this.mail.saveDraft(userEmail, this.packDraftEnvelope(dto));
  }

  async updateDraft(
    userEmail: string,
    draftId: string,
    dto: DraftEmailDto,
  ): Promise<Email> {
    let result: Email | null;
    try {
      result = await this.mail.updateDraft(
        userEmail,
        draftId,
        this.packDraftEnvelope(dto),
      );
    } catch (error) {
      if (error instanceof DraftUpdateConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
    if (!result) {
      throw new NotFoundException(`Draft ${draftId} not found`);
    }
    return result;
  }

  private packDraftEnvelope(dto: DraftEmailDto): DraftEmailDto {
    if (!dto.encryption) return dto;
    return {
      ...dto,
      textBody: packEnvelope(dto.encryption),
      htmlBody: undefined,
    };
  }

  getDraft(userEmail: string, id: string): Promise<Email | null> {
    return this.mail.getDraft(userEmail, id);
  }

  async discardDraft(userEmail: string, id: string): Promise<void> {
    const draft = await this.mail.getDraft(userEmail, id);
    if (!draft) {
      throw new NotFoundException(`Draft ${id} not found`);
    }
    await this.mail.discardDraft(userEmail, id);
  }

  moveEmail(userEmail: string, id: string, target: MailboxType): Promise<void> {
    return this.mail.moveEmail(userEmail, id, target);
  }

  async deleteEmail(userEmail: string, id: string): Promise<void> {
    const { deletedEntryKey } = await this.mail.deleteEmail(userEmail, id);
    if (!deletedEntryKey) return;

    await this.releaseQuotaEntry(userEmail, deletedEntryKey);
  }

  private async releaseQuotaEntry(
    userEmail: string,
    entryKey: string,
  ): Promise<void> {
    const context =
      await this.accountService.findBucketContextByAddress(userEmail);

    if (!context?.networkBucketId) {
      this.logger.warn(
        { userEmail, entryKey },
        'Destroyed message has no network bucket; skipping quota release',
      );
      return;
    }

    try {
      await this.usage.releaseStoredMessage({
        userUuid: context.userUuid,
        bucketId: context.networkBucketId,
        entryKey,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to release quota entry '${entryKey}' for '${userEmail}': ${(error as Error).message}`,
      );
    }
  }

  markAsRead(userEmail: string, id: string, read: boolean): Promise<void> {
    return this.mail.markAsRead(userEmail, id, read);
  }

  markAsFlagged(
    userEmail: string,
    id: string,
    flagged: boolean,
  ): Promise<void> {
    return this.mail.markAsFlagged(userEmail, id, flagged);
  }

  uploadAttachment(
    payload: UploadAttachmentPayload,
  ): Promise<UploadAttachmentResponse> {
    return this.mail.uploadAttachment(payload);
  }

  downloadAttachment(
    payload: DownloadAttachmentPayload,
  ): Promise<DownloadAttachmentResponse> {
    return this.mail.downloadAttachment(payload);
  }

  getQuota(userEmail: string): Promise<MailQuota> {
    return this.mail.getQuota(userEmail);
  }
}
