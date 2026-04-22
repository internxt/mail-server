import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MailProvider } from './mail-provider.port.js';
import type {
  DraftEmailDto,
  Email,
  EmailListResponse,
  Mailbox,
  MailboxType,
  SearchEmailFilter,
  SendEmailDto,
} from './email.types.js';

@Injectable()
export class EmailService {
  constructor(private readonly mail: MailProvider) {}

  getMailboxes(userEmail: string): Promise<Mailbox[]> {
    return this.mail.getMailboxes(userEmail);
  }

  listEmails(
    userEmail: string,
    mailbox: MailboxType | undefined,
    limit: number,
    position: number,
    anchorId?: string,
  ): Promise<EmailListResponse> {
    return this.mail.listEmails(userEmail, mailbox, limit, position, anchorId);
  }

  async getEmail(userEmail: string, id: string): Promise<Email> {
    const email = await this.mail.getEmail(userEmail, id);
    if (!email) {
      throw new NotFoundException(`Email ${id} not found`);
    }
    return email;
  }

  search(params: {
    userEmail: string;
    limit: number;
    position: number;
    filter: SearchEmailFilter;
  }) {
    return this.mail.search(params);
  }

  async sendEmail(
    userEmail: string,
    dto: SendEmailDto,
  ): Promise<{ id: string }> {
    if (dto.to.length === 0) {
      throw new BadRequestException('At least one recipient is required');
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
}
