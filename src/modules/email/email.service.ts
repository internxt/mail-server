import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountService } from '../account/account.service.js';
import { BridgeClient } from '../infrastructure/bridge/bridge.service.js';
import { MailProvider } from './mail-provider.port.js';
import type {
  DraftEmailDto,
  Email,
  EmailAttachment,
  EmailListResponse,
  EmailSummary,
  ListEmails,
  MailQuota,
  Mailbox,
  MailboxType,
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
  decryptBody,
  unwrapAttachmentKey,
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
    private readonly bridge: BridgeClient,
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
    if (dto.to.length === 0) {
      throw new BadRequestException('At least one recipient is required');
    }

    const threading = await this.resolveThreading(userEmail, dto);

    if (dto.encryption) {
      dto = {
        ...dto,
        textBody: packEnvelope(dto.encryption),
        htmlBody: undefined,
      };
    }

    return this.mail.sendEmail(userEmail, dto, threading);
  }

  async sendExternalEmail(
    userEmail: string,
    dto: SendEmailDto,
  ): Promise<{ id: string }> {
    if (dto.to.length === 0) {
      throw new BadRequestException('At least one recipient is required');
    }

    const threading = await this.resolveThreading(userEmail, dto);

    const serverPrivateKey = Buffer.from(
      this.configService.getOrThrow<string>('crypto.serverPrivateKey'),
      'base64',
    );

    const [plainBody, attachments] = await Promise.all([
      this.decryptBodyForExternalDelivery(dto, serverPrivateKey),
      this.decryptAttachmentsForExternalDelivery(
        userEmail,
        dto,
        serverPrivateKey,
      ),
    ]);

    const { messageId } = await this.smtp.sendRaw({
      userEmail,
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      subject: dto.subject,
      text: plainBody ?? dto.textBody,
      attachments,
      inReplyTo: threading?.messageId[0],
      references: threading?.references,
    });

    // Need to save the mail to Sent manually as the smtp service does not save it for us
    await this.mail.saveToSent(
      userEmail,
      {
        ...dto,
        textBody: dto.encryption ? packEnvelope(dto.encryption) : dto.textBody,
        htmlBody: undefined,
      },
      threading,
    );

    return { id: messageId };
  }

  private async resolveThreading(
    userEmail: string,
    dto: SendEmailDto,
  ): Promise<ThreadingHeaders | undefined> {
    if (!dto.inReplyToEmailId) return undefined;
    const threading = await this.mail.getThreadingHeaders(
      userEmail,
      dto.inReplyToEmailId,
    );
    if (!threading) {
      throw new NotFoundException(
        `Replied email ${dto.inReplyToEmailId} not found`,
      );
    }
    return threading;
  }

  private async decryptBodyForExternalDelivery(
    dto: SendEmailDto,
    serverPrivateKey: Uint8Array,
  ): Promise<string | undefined> {
    if (!dto.encryption?.encryptedText || !dto.encryption.wrappedKeys?.length) {
      return undefined;
    }
    return decryptBody(
      dto.encryption.encryptedText,
      dto.encryption.wrappedKeys,
      serverPrivateKey,
    );
  }

  private async decryptAttachmentsForExternalDelivery(
    userEmail: string,
    dto: SendEmailDto,
    serverPrivateKey: Uint8Array,
  ): Promise<SmtpAttachment[] | undefined> {
    if (!dto.attachments?.length) return undefined;

    const wrappedKeys = dto.encryption?.attachmentWrappedKeys;
    if (!wrappedKeys?.length) {
      throw new BadRequestException(
        'attachmentWrappedKeys are required when sending attachments in MIXED mode',
      );
    }

    const attachmentKey = await unwrapAttachmentKey(
      wrappedKeys,
      serverPrivateKey,
    );

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
    const result = await this.mail.updateDraft(
      userEmail,
      draftId,
      this.packDraftEnvelope(dto),
    );
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
      await this.bridge.deleteBucketEntry(
        context.userUuid,
        context.networkBucketId,
        entryKey,
      );
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
