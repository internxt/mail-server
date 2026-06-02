import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountService } from '../account/account.service.js';
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

@Injectable()
export class EmailService {
  constructor(
    private readonly mail: MailProvider,
    private readonly accountService: AccountService,
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

    if (dto.encryption) {
      dto = {
        ...dto,
        textBody: packEnvelope(dto.encryption),
        htmlBody: undefined,
      };
    }

    return this.mail.sendEmail(userEmail, dto);
  }

  saveDraft(userEmail: string, dto: DraftEmailDto): Promise<{ id: string }> {
    return this.mail.saveDraft(userEmail, dto);
  }

  moveEmail(userEmail: string, id: string, target: MailboxType): Promise<void> {
    return this.mail.moveEmail(userEmail, id, target);
  }

  deleteEmail(userEmail: string, id: string): Promise<void> {
    return this.mail.deleteEmail(userEmail, id);
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
